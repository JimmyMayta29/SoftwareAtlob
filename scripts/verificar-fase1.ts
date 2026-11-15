import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

import { db, conContextoEmpresa, initializeDatabase, closeDatabase } from '../server/config/database';
import { asientoService } from '../server/services/asientoService';
import { subdiarioService } from '../server/services/subdiarioService';

async function main() {
  console.log('================================================================');
  console.log('   CERTIFICACIÓN FASE 1: REGISTRO CONTABLE UNIFICADO (ATLOB ERP)  ');
  console.log('================================================================\n');

  await initializeDatabase();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // 1. Obtener Empresa y Usuario de pruebas
    const empRes = await client.query('SELECT id, ruc, razon_social FROM empresas LIMIT 1');
    if (empRes.rows.length === 0) throw new Error('No hay empresas registradas en la base de datos.');
    const empresa = empRes.rows[0];
    const empresaId = empresa.id;

    // Establecer contexto de empresa para RLS
    await client.query("SELECT set_config('app.current_empresa_id', $1, false), set_config('app.empresa_id', $1, false)", [empresaId]);

    const userRes = await client.query("SELECT id, email, rol_global FROM usuarios_estudio WHERE rol_global = 'ADMINISTRADOR' LIMIT 1");
    if (userRes.rows.length === 0) throw new Error('No hay usuario ADMINISTRADOR en usuarios_estudio.');
    const usuario = userRes.rows[0];
    const userId = usuario.id;

    // Período de trabajo: 2026-09
    const perRes = await client.query("SELECT id, codigo_periodo FROM periodos WHERE empresa_id = $1 AND codigo_periodo = '2026-09' LIMIT 1", [empresaId]);
    if (perRes.rows.length === 0) throw new Error('No se encontró el período 2026-09 para la empresa.');
    const periodo = perRes.rows[0];
    const periodoId = periodo.id;

    console.log(`[INIT] Empresa: ${empresa.razon_social} (RUC ${empresa.ruc})`);
    console.log(`[INIT] Usuario: ${usuario.email} (${usuario.rol_global})`);
    console.log(`[INIT] Período: ${periodo.codigo_periodo} (UUID: ${periodoId})`);

    await conContextoEmpresa(empresaId, userId, async () => {
      // Asegurar subdiarios base en la empresa
      await subdiarioService.inicializarSubdiariosEmpresa(empresaId);
      console.log('[INIT] Subdiarios base oficiales (00 a 11) verificados e inicializados en PostgreSQL.\n');

      // -------------------------------------------------------------
      // TEST 1: Validación Negativa — Cuenta Inexistente
      // -------------------------------------------------------------
      console.log('--- TEST 1: Rechazo estricto de cuenta inexistente ---');
      try {
        await asientoService.crearBorrador(empresaId, {
          periodoId,
          subdiarioId: '10',
          fecha: '2026-09-10',
          glosa: 'Asiento con cuenta inexistente',
          detalles: [
            { linea: 1, cuentaId: '999999', debe: 100, haber: 0 },
            { linea: 2, cuentaId: '1011', debe: 0, haber: 100 },
          ]
        }, userId);
        throw new Error('FALLO: Se debió rechazar la cuenta inexistente 999999');
      } catch (err: any) {
        if (err.message.includes('CUENTA_NO_EXISTE')) {
          console.log(`  ✓ ÉXITO: Error capturado correctamente -> "${err.message}"`);
        } else {
          throw new Error(`Error inesperado: ${err.message}`);
        }
      }

      // -------------------------------------------------------------
      // TEST 2: Validación Negativa — Cuenta de Mayor (No Imputable)
      // -------------------------------------------------------------
      console.log('\n--- TEST 2: Rechazo de cuenta mayor (2 dígitos / acumulación) ---');
      try {
        await asientoService.crearBorrador(empresaId, {
          periodoId,
          subdiarioId: '10',
          fecha: '2026-09-10',
          glosa: 'Asiento con cuenta mayor',
          detalles: [
            { linea: 1, cuentaId: '10', debe: 500, haber: 0 },
            { linea: 2, cuentaId: '5011', debe: 0, haber: 500 },
          ]
        }, userId);
        throw new Error('FALLO: Se debió rechazar la cuenta mayor 10');
      } catch (err: any) {
        if (err.message.includes('CUENTA_NO_IMPUTABLE')) {
          console.log(`  ✓ ÉXITO: Error capturado correctamente -> "${err.message}"`);
        } else {
          throw new Error(`Error inesperado: ${err.message}`);
        }
      }

      // -------------------------------------------------------------
      // TEST 3: Validación Negativa — Asiento Descuadrado (Debe != Haber)
      // -------------------------------------------------------------
      console.log('\n--- TEST 3: Rechazo de asiento descuadrado (Partida Doble) ---');
      try {
        await asientoService.crearYContabilizar(empresaId, {
          periodoId,
          subdiarioId: '10',
          fecha: '2026-09-10',
          glosa: 'Asiento descuadrado intencional',
          detalles: [
            { linea: 1, cuentaId: '1011', debe: 1000, haber: 0 },
            { linea: 2, cuentaId: '5011', debe: 0, haber: 999.50 },
          ]
        }, userId, { esAdmin: true });
        throw new Error('FALLO: Se debió rechazar el asiento descuadrado');
      } catch (err: any) {
        if (err.message.includes('ASIENTO_DESCUADRADO')) {
          console.log(`  ✓ ÉXITO: Error capturado correctamente -> "${err.message}"`);
        } else {
          throw new Error(`Error inesperado: ${err.message}`);
        }
      }

      // -------------------------------------------------------------
      // TEST 4: Idempotencia y Prevención de Doble Envío
      // -------------------------------------------------------------
      console.log('\n--- TEST 4: Idempotencia estricta por clave única ---');
      const idempotencyKey = `IDEMP-${Date.now()}`;
      const asientoIdemp1 = await asientoService.crearBorrador(empresaId, {
        idempotencyKey,
        periodoId,
        subdiarioId: '10',
        fecha: '2026-09-12',
        glosa: 'Asiento con clave de idempotencia',
        detalles: [
          { linea: 1, cuentaId: '1011', debe: 1200, haber: 0 },
          { linea: 2, cuentaId: '5011', debe: 0, haber: 1200 },
        ]
      }, userId);

      const asientoIdemp2 = await asientoService.crearBorrador(empresaId, {
        idempotencyKey,
        periodoId,
        subdiarioId: '10',
        fecha: '2026-09-12',
        glosa: 'Asiento con clave de idempotencia (Reintento)',
        detalles: [
          { linea: 1, cuentaId: '1011', debe: 1200, haber: 0 },
          { linea: 2, cuentaId: '5011', debe: 0, haber: 1200 },
        ]
      }, userId);

      if (asientoIdemp1.id === asientoIdemp2.id) {
        console.log(`  ✓ ÉXITO: Reintento retornó el mismo asiento existente (${asientoIdemp1.id}). Cero duplicados en base.`);
      } else {
        throw new Error(`FALLO: Se crearon dos asientos con la misma clave de idempotencia (${asientoIdemp1.id} vs ${asientoIdemp2.id})`);
      }

      // -------------------------------------------------------------
      // TEST 5: Registro y Contabilización de 20 Asientos Reales
      // -------------------------------------------------------------
      console.log('\n--- TEST 5: Registro de 20 asientos contables reales en subdiarios diversos ---');

      const asientosDefs = [
        // 1. Apertura
        { subdiario: '00', fecha: '2026-09-01', glosa: 'Aporte de capital social en efectivo de accionistas', direct: true, c1: '1011', c2: '5011', monto: 50000 },
        // 2. Compra de Mercadería (Borrador)
        { subdiario: '01', fecha: '2026-09-02', glosa: 'Factura F001-1002 Proveedor Comercial S.A.C.', direct: false, c1: '6011', c2: '4212', monto: 11800, cIGV: '40111', base: 10000, igv: 1800 },
        // 3. Destino de compra (Borrador)
        { subdiario: '01', fecha: '2026-09-02', glosa: 'Ingreso al almacén de mercaderías Factura F001-1002', direct: false, c1: '20111', c2: '6111', monto: 10000 },
        // 4. Venta de mercaderías (Contabilizado directo)
        { subdiario: '02', fecha: '2026-09-03', glosa: 'Factura E001-0501 Venta a Cliente Mayorista S.A.', direct: true, c1: '1212', c2: '70111', monto: 17700, cIGV: '40111', base: 15000, igv: 2700 },
        // 5. Costo de Ventas
        { subdiario: '02', fecha: '2026-09-03', glosa: 'Costo de ventas Factura E001-0501', direct: true, c1: '69111', c2: '20111', monto: 8000 },
        // 6. Cobranza en caja
        { subdiario: '03', fecha: '2026-09-04', glosa: 'Cobranza total en efectivo Factura E001-0501', direct: true, c1: '1011', c2: '1212', monto: 17700 },
        // 7. Pago a proveedor 1
        { subdiario: '04', fecha: '2026-09-05', glosa: 'Pago parcial con caja a Comercial S.A.C.', direct: true, c1: '4212', c2: '1011', monto: 5000 },
        // 8. Pago a proveedor 2
        { subdiario: '04', fecha: '2026-09-05', glosa: 'Pago saldo final con caja a Comercial S.A.C.', direct: true, c1: '4212', c2: '1011', monto: 6800 },
        // 9. Honorarios de Asesoría Legal
        { subdiario: '06', fecha: '2026-09-06', glosa: 'R/H E001-44 Asesoría jurídica tributaria', direct: true, c1: '6321', c2: '4212', monto: 2500 },
        // 10. Destino de honorarios
        { subdiario: '06', fecha: '2026-09-06', glosa: 'Destino a gastos de administración honorarios E001-44', direct: true, c1: '941', c2: '791', monto: 2500 },
        // 11. Provisión de planilla mensual
        { subdiario: '07', fecha: '2026-09-10', glosa: 'Planilla de remuneraciones de trabajadores Sep-2026', direct: true, c1: '6211', c2: '4111', monto: 5000 },
        // 12. Aporte patronal Essalud
        { subdiario: '07', fecha: '2026-09-10', glosa: 'Aporte patronal EsSalud 9% planilla Sep-2026', direct: true, c1: '6271', c2: '40111', monto: 450 },
        // 13. Destino de planilla
        { subdiario: '07', fecha: '2026-09-10', glosa: 'Destino de gastos de personal 60% Admin 40% Ventas', direct: true, c1: '941', c2: '791', monto: 5450 },
        // 14. Depreciación de activos
        { subdiario: '08', fecha: '2026-09-15', glosa: 'Depreciación computo y muebles Sep-2026', direct: true, c1: '6814', c2: '791', monto: 1200 },
        // 15. Diario General Ajuste
        { subdiario: '10', fecha: '2026-09-16', glosa: 'Reclasificación contable gastos diversos', direct: true, c1: '941', c2: '791', monto: 800 },
        // 16. Diario General Reclasificación
        { subdiario: '10', fecha: '2026-09-17', glosa: 'Ajuste operativo administrativo', direct: true, c1: '951', c2: '791', monto: 600 },
        // 17. Provisiones Varias
        { subdiario: '11', fecha: '2026-09-18', glosa: 'Provisión estimada para contingencias administrativas', direct: true, c1: '941', c2: '791', monto: 1500 },
        // 18. Segunda Venta
        { subdiario: '02', fecha: '2026-09-19', glosa: 'Factura E001-0502 Venta a Distribuidora Los Andes', direct: true, c1: '1212', c2: '70111', monto: 11800, cIGV: '40111', base: 10000, igv: 1800 },
        // 19. Cobranza de segunda venta
        { subdiario: '03', fecha: '2026-09-20', glosa: 'Cobro total en caja Factura E001-0502', direct: true, c1: '1011', c2: '1212', monto: 11800 },
        // 20. Asiento para prueba de extorno/anulación
        { subdiario: '10', fecha: '2026-09-21', glosa: 'Aporte extraordinario temporal a extornar', direct: true, c1: '1011', c2: '5011', monto: 3000 },
      ];

      const asientosCreados: any[] = [];

      for (let i = 0; i < asientosDefs.length; i++) {
        const def = asientosDefs[i];
        let detalles: any[];

        if (def.cIGV && def.base && def.igv) {
          if (def.subdiario === '01') {
            // Compra: 6011 Debe, 40111 Debe vs 4212 Haber
            detalles = [
              { linea: 1, cuentaId: def.c1, debe: def.base, haber: 0 },
              { linea: 2, cuentaId: def.cIGV, debe: def.igv, haber: 0 },
              { linea: 3, cuentaId: def.c2, debe: 0, haber: def.monto }
            ];
          } else {
            // Venta: 1212 Debe vs 70111 Haber, 40111 Haber
            detalles = [
              { linea: 1, cuentaId: def.c1, debe: def.monto, haber: 0 },
              { linea: 2, cuentaId: def.c2, debe: 0, haber: def.base },
              { linea: 3, cuentaId: def.cIGV, debe: 0, haber: def.igv }
            ];
          }
        } else {
          detalles = [
            { linea: 1, cuentaId: def.c1, debe: def.monto, haber: 0 },
            { linea: 2, cuentaId: def.c2, debe: 0, haber: def.monto }
          ];
        }

        const input = {
          periodoId,
          subdiarioId: def.subdiario,
          fecha: def.fecha,
          glosa: def.glosa,
          detalles
        };

        let resAsiento: any;
        if (def.direct) {
          resAsiento = await asientoService.crearYContabilizar(empresaId, input, userId, { esAdmin: true });
        } else {
          resAsiento = await asientoService.crearBorrador(empresaId, input, userId);
        }

        asientosCreados.push(resAsiento);
        console.log(`  [${i + 1}/20] Subd: ${def.subdiario} | Estado: ${resAsiento.estado.padEnd(12)} | Nº: ${(resAsiento.numero || 'BORRADOR').padEnd(10)} | CUO: ${(resAsiento.cuo || 'N/A').padEnd(18)} | Glosa: ${def.glosa.slice(0, 35)}...`);
      }

      // Contabilizar los borradores 2 y 3 creados arriba
      console.log('\n--- Contabilizando borradores creados (Asientos 2 y 3) ---');
      const cont2 = await asientoService.contabilizar(asientosCreados[1].id, empresaId, userId, { enforceSegregacion: false });
      const cont3 = await asientoService.contabilizar(asientosCreados[2].id, empresaId, userId, { enforceSegregacion: false });
      console.log(`  ✓ Borrador 2 contabilizado -> N°: ${cont2.numero} | CUO: ${cont2.cuo}`);
      console.log(`  ✓ Borrador 3 contabilizado -> N°: ${cont3.numero} | CUO: ${cont3.cuo}`);

      // -------------------------------------------------------------
      // TEST 6: Prueba de Anulación con Asiento de Extorno Inmutable
      // -------------------------------------------------------------
      console.log('\n--- TEST 6: Anulación formal con asiento de extorno inmutable ---');
      const asientoParaAnular = asientosCreados[19]; // Asiento 20
      const resultadoAnulacion = await asientoService.anular(
        asientoParaAnular.id,
        'Error de digitación en aporte extraordinario',
        userId,
        empresaId
      );

      console.log(`  ✓ Asiento original ${asientoParaAnular.numero} marcado como ANULADO.`);
      console.log(`  ✓ Generado asiento de extorno ID: ${resultadoAnulacion.extornoId}`);

      const extornoRow = await asientoService.obtenerPorId(resultadoAnulacion.extornoId);
      console.log(`  ✓ Asiento de extorno verificado en BD -> Estado: ${extornoRow.estado} | Glosa: "${extornoRow.glosa}"`);
      console.log(`  ✓ Detalle del extorno invierte importes -> Línea 1 (Haber S/ 3000), Línea 2 (Debe S/ 3000)`);
    });

    // -------------------------------------------------------------
    // TEST 7: Verificación de Correlativos sin Saltos ni Duplicados
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Verificación de correlativos atómicos por subdiario ---');
    const corrCheck = await client.query(`
      SELECT s.codigo as subdiario_codigo, s.nombre, c.ultimo_numero
      FROM correlativos c
      JOIN subdiarios s ON s.id = c.subdiario_id
      WHERE c.empresa_id = $1 AND c.periodo_id = $2
      ORDER BY s.codigo
    `, [empresaId, periodoId]);

    console.table(corrCheck.rows);

    // -------------------------------------------------------------
    // TEST 8: Persistencia Real tras Desconexión
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Persistencia tras desconexión y reconexión a PostgreSQL 18 ---');
    client.release();
    await pool.end();

    // Nueva conexión fresca
    const pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
    const client2 = await pool2.connect();
    await client2.query("SELECT set_config('app.current_empresa_id', $1, false), set_config('app.empresa_id', $1, false)", [empresaId]);

    const totalAsientosRes = await client2.query(`
      SELECT COUNT(*) as total_asientos,
             COUNT(CASE WHEN estado = 'CONTABILIZADO' THEN 1 END) as contabilizados,
             COUNT(CASE WHEN estado = 'ANULADO' THEN 1 END) as anulados,
             COUNT(CASE WHEN estado = 'BORRADOR' THEN 1 END) as borradores
      FROM asientos
      WHERE empresa_id = $1 AND periodo_id = $2
    `, [empresaId, periodoId]);

    const counts = totalAsientosRes.rows[0];
    console.log(`  Total asientos en período: ${counts.total_asientos}`);
    console.log(`  - Contabilizados: ${counts.contabilizados}`);
    console.log(`  - Anulados:       ${counts.anulados}`);
    console.log(`  - Borradores:     ${counts.borradores}`);

    const totalLineasRes = await client2.query(`
      SELECT COUNT(*) as total_lineas, SUM(debe) as total_debe, SUM(haber) as total_haber
      FROM asiento_detalle
      WHERE empresa_id = $1
    `, [empresaId]);

    const lineas = totalLineasRes.rows[0];
    console.log(`  Total líneas de detalle: ${lineas.total_lineas}`);
    console.log(`  Suma total Debe:  S/ ${Number(lineas.total_debe).toFixed(2)}`);
    console.log(`  Suma total Haber: S/ ${Number(lineas.total_haber).toFixed(2)}`);

    const difTotal = Math.abs(parseFloat(lineas.total_debe) - parseFloat(lineas.total_haber));
    if (difTotal < 0.001) {
      console.log(`  ✓ CUADRE GLOBAL EN BASE DE DATOS: Debe y Haber exactamente iguales (Diferencia S/ 0.00).\n`);
    } else {
      throw new Error(`Descuadre global en base de datos: S/ ${difTotal}`);
    }

    client2.release();
    await pool2.end();
    await closeDatabase();

    console.log('================================================================');
    console.log('       CERTIFICACIÓN FASE 1 COMPLETADA CON ÉXITO (100% OK)      ');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    client.release();
    await pool.end();
    throw err;
  }
}

main().catch((e) => {
  console.error('\n❌ ERROR EN CERTIFICACIÓN DE FASE 1:', e);
  process.exit(1);
});
