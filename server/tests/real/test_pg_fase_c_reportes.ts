import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';

const envConfig = fs.existsSync('.env') ? parse(fs.readFileSync('.env', 'utf8')) : {};
const connectionString = process.env.TEST_DATABASE_URL || envConfig.TEST_DATABASE_URL || 'postgresql://contabilidad_app:Craxker29@localhost:5432/atlob_test';

async function ejecutar() {
  console.log('========================================================================');
  console.log('🏛️ VALIDACIÓN INTEGRAL EN POSTGRESQL REAL: FASE C (REPORTES Y CONCILIACIÓN)');
  console.log('========================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;

  let pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
  const { setPostgresPool, conContextoEmpresa } = await import('../../config/database');
  setPostgresPool(pool, true);

  const { librosEEFFService } = await import('../../services/librosEEFFService');
  const { saldosService } = await import('../../services/saldosService');
  const { asientoService } = await import('../../services/asientoService');
  const { cierreAnualService } = await import('../../services/cierreAnualService');
  const { periodoService } = await import('../../services/periodoService');
  const { aperturaCierreService } = await import('../../services/aperturaCierreService');
  const { pleExportService } = await import('../../services/pleExportService');
  const { subdiarioService } = await import('../../services/subdiarioService');

  let client = await pool.connect();

  const tenantId = crypto.randomUUID();
  let usuarioEfectivoId = crypto.randomUUID();
  const empresaId = crypto.randomUUID();
  const ruc = '20999000033';
  const periodo = '2026-03';
  const ejercicioId = crypto.randomUUID();
  const periodoId = crypto.randomUUID();

  try {
    console.log('--- 1. SEMBRADO DE EMPRESA Y CONFIGURACIÓN CONTABLE BASE ---');
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO tenants (id, nombre)
      VALUES ($1, 'Tenant Fase C')
      ON CONFLICT (id) DO NOTHING
    `, [tenantId]);

    const userRes = await client.query(`
      INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
      VALUES ($1, 'admin.fasec@atlob.pe', '$2b$10$abcdefghijklmnopqrstuv', 'Admin Fase C', 'ADMINISTRADOR', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true
      RETURNING id
    `, [usuarioEfectivoId]);
    usuarioEfectivoId = userRes.rows[0].id;

    await client.query(`
      INSERT INTO empresas (
        id, tenant_id, codigo_empresa, ruc, razon_social, nombre_comercial,
        regimen_tributario, domicilio_fiscal, moneda_principal, is_active
      ) VALUES (
        $1, $2, 'EMP-FASE-C', $3, 'COMERCIAL FASE C S.A.C.', 'FASE C STORE',
        'MYPE_TRIBUTARIO', 'AV. LOS VENCEDORES 789, LIMA', 'PEN', true
      )
    `, [empresaId, tenantId, ruc]);

    // Buscar rol ADMINISTRADOR en roles
    const { rows: rolRows } = await client.query(`SELECT id FROM roles WHERE codigo = 'ADMINISTRADOR' LIMIT 1`);
    const rolAdminId = rolRows.length > 0 ? rolRows[0].id : crypto.randomUUID();
    if (rolRows.length === 0) {
      await client.query(`INSERT INTO roles (id, codigo, nombre) VALUES ($1, 'ADMINISTRADOR', 'Administrador General')`, [rolAdminId]);
    }

    await client.query(`
      SELECT set_config('app.usuario_id', $1, false),
             set_config('app.user_id', $1, false),
             set_config('app.empresa_id', $2, false),
             set_config('app.current_empresa_id', $2, false)
    `, [usuarioEfectivoId, empresaId]);

    await client.query(`
      INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
      VALUES ($1, $2, $3, $4, true)
    `, [crypto.randomUUID(), usuarioEfectivoId, empresaId, rolAdminId]);

    await client.query(`
      INSERT INTO ejercicios (id, empresa_id, anio, estado)
      VALUES ($1, $2, 2026, 'ABIERTO')
    `, [ejercicioId, empresaId]);

    await client.query(`
      INSERT INTO periodos (id, empresa_id, ejercicio_id, mes, anio, codigo_periodo, estado)
      VALUES ($1, $2, $3, 3, 2026, $4, 'ABIERTO')
    `, [periodoId, empresaId, ejercicioId, periodo]);

    const subdiariosConfig = [
      { codigo: '00', descripcion: 'APERTURA', tipo: 'APERTURA' },
      { codigo: '01', descripcion: 'REGISTRO DE COMPRAS', tipo: 'COMPRAS' },
      { codigo: '02', descripcion: 'REGISTRO DE VENTAS', tipo: 'VENTAS' },
      { codigo: '03', descripcion: 'COBRANZAS Y CAJA', tipo: 'COBRANZAS' },
      { codigo: '04', descripcion: 'PAGOS A PROVEEDORES', tipo: 'PAGOS' },
      { codigo: '05', descripcion: 'BANCOS Y CUENTAS CORRIENTES', tipo: 'BANCOS' },
      { codigo: '06', descripcion: 'CAJA CHICA', tipo: 'CAJA' },
      { codigo: '07', descripcion: 'PLANILLA DE REMUNERACIONES', tipo: 'PLANILLA' },
      { codigo: '08', descripcion: 'RECIBOS POR HONORARIOS', tipo: 'HONORARIOS' },
      { codigo: '09', descripcion: 'CIERRE CONTABLE ANUAL', tipo: 'CIERRE' },
      { codigo: '10', descripcion: 'ASIENTOS DE DIARIO Y PROVISIONES', tipo: 'DIARIO' },
      { codigo: '11', descripcion: 'COSTO DE VENTAS Y DESTINO', tipo: 'DESTINO' },
    ];

    const subMap = new Map<string, string>();
    for (const sub of subdiariosConfig) {
      const sId = crypto.randomUUID();
      await client.query(`
        INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [sId, empresaId, sub.codigo, sub.descripcion, sub.tipo]);
      subMap.set(sub.codigo, sId);
    }

    const planCuentas = [
      { c: '1041', n: 'Cuentas corrientes operativas', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '1212', n: 'Emitidas en cartera', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '20111', n: 'Mercaderías manufacturadas', tipo: 'ACTIVO', cl: 'ACTIVO_CORRIENTE' },
      { c: '40111', n: 'IGV - Cuenta propia', tipo: 'PASIVO', cl: 'PASIVO_CORRIENTE' },
      { c: '4212', n: 'Facturas por pagar emitidas', tipo: 'PASIVO', cl: 'PASIVO_CORRIENTE' },
      { c: '5011', n: 'Capital social pagado', tipo: 'PATRIMONIO', cl: 'PATRIMONIO' },
      { c: '5911', n: 'Utilidades acumuladas', tipo: 'PATRIMONIO', cl: 'PATRIMONIO' },
      { c: '6011', n: 'Mercaderías manufacturadas', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '6111', n: 'Variación de mercaderías', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '676', n: 'Diferencia de cambio - Pérdida', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '69121', n: 'Mercaderías - Costo de ventas', tipo: 'GASTO', cl: 'NO_APLICA' },
      { c: '70121', n: 'Mercaderías venta local', tipo: 'INGRESO', cl: 'NO_APLICA' },
      { c: '776', n: 'Diferencia de cambio - Ganancia', tipo: 'INGRESO', cl: 'NO_APLICA' }
    ];

    const ctaMap = new Map<string, string>();
    for (const p of planCuentas) {
      const cId = crypto.randomUUID();
      await client.query(`
        INSERT INTO plan_cuentas (
          id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, clasificacion_eeff, is_active
        ) VALUES (
          $1, $2, $3, $4, 4, $5, true, $6, true
        )
      `, [cId, empresaId, p.c, p.n, p.tipo, p.cl]);
      ctaMap.set(p.c, cId);
    }

    const proveedorId = crypto.randomUUID();
    const clienteId = crypto.randomUUID();

    await client.query(`
      INSERT INTO anexos (id, empresa_id, tipo_entidad, tipo_documento, numero_documento, razon_social)
      VALUES 
      ($1, $2, 'PROVEEDOR', '6', '20500112233', 'PROVEEDOR CENTRAL S.A.C.'),
      ($3, $2, 'CLIENTE', '6', '20600998877', 'CLIENTE MAYORISTA S.A.C.')
    `, [proveedorId, empresaId, clienteId]);

    // Asiento 1: Apertura (Subdiario 00)
    const as1Id = crypto.randomUUID();
    await client.query(`
      INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, estado, origen)
      VALUES ($1, $2, $3, $4, '00030001', '2026-03-01', 'Asiento de apertura 2026', 'BORRADOR', 'APERTURA')
    `, [as1Id, empresaId, periodoId, subMap.get('00')]);

    await client.query(`
      INSERT INTO asiento_detalle (id, empresa_id, asiento_id, linea, cuenta_id, debe, haber, glosa_linea)
      VALUES
      ($1, $2, $3, 1, $4, 50000.00, 0.00, 'Bancos operativas'),
      ($5, $2, $3, 2, $6, 20000.00, 0.00, 'Clientes cartera apertura'),
      ($7, $2, $3, 3, $8, 30000.00, 0.00, 'Inventario inicial'),
      ($9, $2, $3, 4, $10, 0.00, 100000.00, 'Capital suscrito')
    `, [
      crypto.randomUUID(), empresaId, as1Id, ctaMap.get('1041'),
      crypto.randomUUID(), ctaMap.get('1212'),
      crypto.randomUUID(), ctaMap.get('20111'),
      crypto.randomUUID(), ctaMap.get('5011')
    ]);

    await client.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [as1Id]);

    // Asiento 2: Compra Mercaderías (Subdiario 01)
    const as2Id = crypto.randomUUID();
    await client.query(`
      INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, estado, origen)
      VALUES ($1, $2, $3, $4, '01030001', '2026-03-05', 'Compra de mercaderías F001-0001', 'BORRADOR', 'COMPRA')
    `, [as2Id, empresaId, periodoId, subMap.get('01')]);

    await client.query(`
      INSERT INTO asiento_detalle (id, empresa_id, asiento_id, linea, cuenta_id, debe, haber, glosa_linea)
      VALUES
      ($1, $2, $3, 1, $4, 10000.00, 0.00, 'Base gravada compra'),
      ($5, $2, $3, 2, $6, 1800.00, 0.00, 'Crédito fiscal IGV'),
      ($7, $2, $3, 3, $8, 0.00, 11800.00, 'Factura por pagar'),
      ($9, $2, $3, 4, $10, 10000.00, 0.00, 'Destino almacén'),
      ($11, $2, $3, 5, $12, 0.00, 10000.00, 'Variación existencias')
    `, [
      crypto.randomUUID(), empresaId, as2Id, ctaMap.get('6011'),
      crypto.randomUUID(), ctaMap.get('40111'),
      crypto.randomUUID(), ctaMap.get('4212'),
      crypto.randomUUID(), ctaMap.get('20111'),
      crypto.randomUUID(), ctaMap.get('6111')
    ]);

    await client.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [as2Id]);

    // Insertar comprobante de compra y cuenta por pagar
    const compraId = crypto.randomUUID();
    await client.query(`
      INSERT INTO comprobantes_compra (
        id, empresa_id, periodo_id, tipo_comprobante, serie, numero, fecha_emision, fecha_contable,
        fecha_vencimiento, proveedor_id, moneda, tipo_cambio, base_gravada, igv, total, estado
      ) VALUES (
        $1, $2, $3, '01', 'F001', '0000001', '2026-03-05', '2026-03-05',
        '2026-04-05', $4, 'PEN', 3.75, 10000.00, 1800.00, 11800.00, 'REGISTRADO'
      )
    `, [compraId, empresaId, periodoId, proveedorId]);

    const cxpId = crypto.randomUUID();
    await client.query(`
      INSERT INTO cuentas_por_pagar (
        id, empresa_id, comprobante_id, proveedor_id, moneda, importe_original, saldo, fecha_emision, fecha_vencimiento, estado
      ) VALUES (
        $1, $2, $3, $4, 'PEN', 11800.00, 11800.00, '2026-03-05', '2026-04-05', 'PENDIENTE'
      )
    `, [cxpId, empresaId, compraId, proveedorId]);

    // Asiento 3: Venta Mercaderías (Subdiario 02)
    const as3Id = crypto.randomUUID();
    await client.query(`
      INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, estado, origen)
      VALUES ($1, $2, $3, $4, '02030001', '2026-03-12', 'Venta mercaderías F001-0010', 'BORRADOR', 'VENTA')
    `, [as3Id, empresaId, periodoId, subMap.get('02')]);

    await client.query(`
      INSERT INTO asiento_detalle (id, empresa_id, asiento_id, linea, cuenta_id, debe, haber, glosa_linea)
      VALUES
      ($1, $2, $3, 1, $4, 23600.00, 0.00, 'Cuenta por cobrar cliente'),
      ($5, $2, $3, 2, $6, 0.00, 3600.00, 'Débito fiscal IGV'),
      ($7, $2, $3, 3, $8, 0.00, 20000.00, 'Venta neta local'),
      ($9, $2, $3, 4, $10, 8000.00, 0.00, 'Costo de ventas'),
      ($11, $2, $3, 5, $12, 0.00, 8000.00, 'Salida de existencias')
    `, [
      crypto.randomUUID(), empresaId, as3Id, ctaMap.get('1212'),
      crypto.randomUUID(), ctaMap.get('40111'),
      crypto.randomUUID(), ctaMap.get('70121'),
      crypto.randomUUID(), ctaMap.get('69121'),
      crypto.randomUUID(), ctaMap.get('20111')
    ]);

    await client.query(`UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id = $1`, [as3Id]);

    // Insertar comprobante de venta y cuenta por cobrar
    const ventaId = crypto.randomUUID();
    await client.query(`
      INSERT INTO comprobantes_venta (
        id, empresa_id, periodo_id, tipo_comprobante, serie, numero, fecha_emision, fecha_contable,
        fecha_vencimiento, cliente_id, moneda, tipo_cambio, base_gravada, igv, total, estado
      ) VALUES (
        $1, $2, $3, '01', 'F001', '0000010', '2026-03-12', '2026-03-12',
        '2026-04-12', $4, 'PEN', 3.75, 20000.00, 3600.00, 23600.00, 'REGISTRADO'
      )
    `, [ventaId, empresaId, periodoId, clienteId]);

    const cxcId = crypto.randomUUID();
    await client.query(`
      INSERT INTO cuentas_por_cobrar (
        id, empresa_id, comprobante_id, cliente_id, moneda, importe_original, saldo, fecha_emision, fecha_vencimiento, estado
      ) VALUES (
        $1, $2, $3, $4, 'PEN', 23600.00, 23600.00, '2026-03-12', '2026-04-12', 'PENDIENTE'
      )
    `, [cxcId, empresaId, ventaId, clienteId]);

    await client.query('COMMIT');
    console.log('✅ Empresa de prueba, subdiarios, plan contable, asientos y comprobantes creados.\n');

    let mayorTotalSumasDebe = 0;

    await conContextoEmpresa(empresaId, usuarioEfectivoId, async () => {
      // --- 2. CONCILIACIÓN CONTABLE DE S/ 0.00 (DIARIO, MAYOR, BALANCE, EEFF) ---
      console.log('--- 2. CONCILIACIÓN MATEMÁTICA EXACTA DE S/ 0.00 ENTRE REPORTES ---');

      // 2.1 Libro Diario
      const diario = await librosEEFFService.generarLibroDiario(empresaId, periodo);
      console.log(`- Libro Diario: Total Débitos = S/ ${diario.totalDebe.toFixed(2)}, Total Créditos = S/ ${diario.totalHaber.toFixed(2)}`);
      assert.equal(diario.totalDebe, diario.totalHaber, 'Libro Diario debe estar perfectamente cuadrado Debe == Haber');
      assert.equal(diario.estaBalanceado, true, 'Libro Diario balanceado flag debe ser true');

      // 2.2 Libro Mayor
      const mayor = await librosEEFFService.generarLibroMayor(empresaId, periodo);
      console.log(`- Libro Mayor: Suma Débitos = S/ ${mayor.totalSumasDebe.toFixed(2)}, Suma Créditos = S/ ${mayor.totalSumasHaber.toFixed(2)}`);
      assert.equal(mayor.totalSumasDebe, mayor.totalSumasHaber, 'Libro Mayor debe estar balanceado Débitos == Créditos');
      assert.equal(mayor.totalSumasDebe, diario.totalDebe, 'Sumas del Mayor deben coincidir al centavo con el Libro Diario');
      mayorTotalSumasDebe = mayor.totalSumasDebe;

      const difMayorDiario = Math.abs(mayor.totalSumasDebe - diario.totalDebe);
      console.log(`  -> Diferencia Libro Diario vs Libro Mayor: S/ ${difMayorDiario.toFixed(2)} (Meta: S/ 0.00)`);
      assert.equal(difMayorDiario, 0, 'Diferencia entre Diario y Mayor debe ser exactamente S/ 0.00');

      // 2.3 Balance de Comprobación y Hoja de Trabajo 10 Columnas
      const hojaTrabajo = await librosEEFFService.generarHojaTrabajo10Columnas(empresaId, periodo);
      console.log(`- Hoja de Trabajo 10 Col: Montos Debe = S/ ${hojaTrabajo.totales.montosDebe.toFixed(2)}, Haber = S/ ${hojaTrabajo.totales.montosHaber.toFixed(2)}`);
      console.log(`  Saldos Deudor = S/ ${hojaTrabajo.totales.saldoDeudor.toFixed(2)}, Acreedor = S/ ${hojaTrabajo.totales.saldoAcreedor.toFixed(2)}`);
      console.log(`  Resultado Balance = S/ ${hojaTrabajo.resultadoEjercicio.monto.toFixed(2)} (${hojaTrabajo.resultadoEjercicio.tipo})`);

      assert.equal(hojaTrabajo.controlesCuadre.montosCuadrados, true, 'Montos de hoja de trabajo deben estar cuadrados');
      assert.equal(hojaTrabajo.controlesCuadre.saldosCuadrados, true, 'Saldos deudor y acreedor deben estar cuadrados');
      assert.equal(hojaTrabajo.controlesCuadre.todoCuadrado, true, 'Control integral de cuadre debe ser true');

      // 2.4 Estados Financieros Oficiales
      const eeffSituacion = await librosEEFFService.generarEstadoSituacionFinanciera(empresaId, periodo);
      const eeffResultados = await librosEEFFService.generarEstadoResultados(empresaId, periodo);

      console.log(`- Estado Situación Financiera: Total Activo = S/ ${eeffSituacion.totalActivo.toFixed(2)}, Pasivo + Patrimonio = S/ ${eeffSituacion.totalPasivoYPatrimonio.toFixed(2)}`);
      console.log(`  Diferencia de cuadre = S/ ${eeffSituacion.diferenciaCuadre.toFixed(2)}`);
      assert.equal(eeffSituacion.estaCuadrado, true, 'Estado de Situación Financiera debe estar cuadrado');
      assert.equal(eeffSituacion.diferenciaCuadre, 0, 'Diferencia de cuadre del Balance debe ser exactamente S/ 0.00');

      console.log(`- Estado de Resultados: Utilidad Naturaleza = S/ ${eeffResultados.porNaturaleza.utilidadNeta.toFixed(2)}, Utilidad Función = S/ ${eeffResultados.porFuncion.utilidadNeta.toFixed(2)}`);
      assert.equal(eeffResultados.porNaturaleza.utilidadNeta, eeffResultados.porFuncion.utilidadNeta, 'Utilidad Neta por Naturaleza y por Función deben ser idénticas');

      console.log('✅ Conciliación cuádruple de S/ 0.00 superada con éxito.\n');

      // --- 3. CARTERA CXC Y CXP DIRECTA A POSTGRESQL REAL ---
      console.log('--- 3. VERIFICACIÓN DE CARTERA CXC Y CXP CON OPERACIONES REALES ---');

      // CxC: Consultar y cobrar
      const cxcList = await saldosService.listarCxC(empresaId);
      console.log(`- Documentos por Cobrar detectados en PostgreSQL: ${cxcList.length}`);
      assert.ok(cxcList.length > 0, 'Debe existir al menos un documento por cobrar');
      const docCobrar = cxcList.find(d => d.comprobanteId === ventaId);
      assert.ok(docCobrar, 'Comprobante de venta debe figurar en cuentas por cobrar');
      assert.equal(docCobrar.saldo, 23600.00, 'Saldo inicial debe ser S/ 23,600.00');

      // Aplicar cobranza
      const cobroResultado = await saldosService.aplicarCobranza(empresaId, {
        fechaCobranza: '2026-03-20',
        moneda: 'PEN',
        aplicaciones: [{
          cuentaPorCobrarId: docCobrar.id,
          importe: 23600.00
        }]
      }, usuarioEfectivoId);

      console.log(`- Cobranza total aplicada: ${cobroResultado.mensaje}`);
      const cxcActualizada = await saldosService.listarCxC(empresaId);
      const docCobradoFinal = cxcActualizada.find(d => d.id === docCobrar.id);
      assert.ok(!docCobradoFinal || docCobradoFinal.saldo === 0, 'El saldo por cobrar debe haber quedado en S/ 0.00');

      // CxP: Consultar y pagar
      const cxpList = await saldosService.listarCxP(empresaId);
      console.log(`- Documentos por Pagar detectados en PostgreSQL: ${cxpList.length}`);
      assert.ok(cxpList.length > 0, 'Debe existir al menos un documento por pagar');
      const docPagar = cxpList.find(d => d.comprobanteId === compraId);
      assert.ok(docPagar, 'Comprobante de compra debe figurar en cuentas por pagar');
      assert.equal(docPagar.saldo, 11800.00, 'Saldo inicial debe ser S/ 11,800.00');

      // Aplicar pago
      const pagoResultado = await saldosService.aplicarPago(empresaId, {
        fechaPago: '2026-03-22',
        moneda: 'PEN',
        aplicaciones: [{
          cuentaPorPagarId: docPagar.id,
          importe: 11800.00
        }]
      }, usuarioEfectivoId);

      console.log(`- Pago total aplicado: ${pagoResultado.mensaje}`);
      const cxpActualizada = await saldosService.listarCxP(empresaId);
      const docPagadoFinal = cxpActualizada.find(d => d.id === docPagar.id);
      assert.ok(!docPagadoFinal || docPagadoFinal.saldo === 0, 'El saldo por pagar debe haber quedado en S/ 0.00');

      console.log('✅ Cartera CxC y CxP verificada y conectada a PostgreSQL real.\n');

      // --- 4. CIERRES, PERIODOS Y AJUSTES NIC 21 ---
      console.log('--- 4. CIERRE MENSUAL, CIERRE ANUAL Y AJUSTE DIFERENCIA DE CAMBIO ---');

      // 4.1 Cierre y reapertura de período contable
      const perCerrado = await periodoService.cerrar(periodoId, usuarioEfectivoId, empresaId);
      assert.equal(perCerrado.estado, 'CERRADO', 'Período debe quedar CERRADO');
      console.log(`- Período ${periodo} cerrado formalmente.`);

      const perReabierto = await periodoService.reabrir(periodoId, 'Reapertura para pruebas de auditoría Fase C', usuarioEfectivoId, 'ADMINISTRADOR', empresaId);
      assert.equal(perReabierto.estado, 'ABIERTO', 'Período debe quedar ABIERTO');
      console.log(`- Período ${periodo} reabierto con éxito.`);

      // 4.2 Ajuste Diferencia de Cambio NIC 21
      const ajusteDc = aperturaCierreService.calcularDiferenciaCambio(10000, 3.730, 3.745, false);
      assert.ok(ajusteDc.ajusteSoles > 0, 'El ajuste de diferencia de cambio debe ser mayor a 0');
      console.log(`- Ajuste NIC 21 calculado: S/ ${ajusteDc.ajusteSoles.toFixed(2)} (${ajusteDc.esGanancia ? 'Ganancia' : 'Pérdida'})`);

      const asientoDc = await asientoService.crearAsiento(empresaId, {
        periodoId: periodo,
        subdiarioId: '06',
        fecha: '2026-03-28',
        glosa: 'Ajuste mensual diferencia de cambio NIC 21',
        moneda: 'PEN',
        tipoCambio: 3.745,
        origen: 'AJUSTES',
        detalles: ajusteDc.lineas.map((l, idx) => ({
          linea: idx + 1,
          cuentaId: l.codigoCuenta,
          debe: l.debe,
          haber: l.haber,
          glosaLinea: l.glosaLinea
        }))
      }, usuarioEfectivoId);
      assert.ok(asientoDc.id, 'Asiento de diferencia de cambio debe crearse');
      console.log(`- Asiento de diferencia de cambio creado: ${asientoDc.numero || asientoDc.id}`);

      // 4.3 Cierre Anual PCGE (Elemento 8)
      const cierreAnual = await cierreAnualService.ejecutarCierreAnual(empresaId, 2026, usuarioEfectivoId);
      console.log(`- Cierre anual 2026 ejecutado: ${cierreAnual.asientosCreados} asientos generados.`);
      assert.ok(cierreAnual.asientosCreados >= 8, 'Deben generarse al menos los 8 asientos del elemento 8');

      console.log('✅ Módulos de cierre, reapertura y diferencia de cambio verificados.\n');

      // --- 5. EXPORTACIÓN PLE 5.1 Y PLE 5.2 ---
      console.log('--- 5. GENERACIÓN OFICIAL DE LIBROS ELECTRÓNICOS PLE ---');

      const pleDiario = await librosEEFFService.generarPle51DiarioTxt(empresaId, periodo);
      assert.ok(pleDiario.contenidoTxt.length > 0, 'El archivo PLE 5.1 Libro Diario debe contener registros');
      console.log(`- PLE 5.1 Diario generado: ${pleDiario.nombreArchivo} (${pleDiario.totalLineas} líneas).`);

      const pleCompras = await pleExportService.exportarLibro(empresaId, periodo, '080100', ruc, usuarioEfectivoId, { sinMovimiento: false, esOficial: true });
      assert.ok(pleCompras.nombreArchivo.startsWith('LE'), 'El nombre del archivo debe iniciar con LE');
      assert.ok(pleCompras.nombreArchivo.endsWith('.txt'), 'El archivo debe tener extensión .txt');
      console.log(`- PLE 5.2 Compras generado: ${pleCompras.nombreArchivo} (${pleCompras.totalFilas} registros).`);

      const pleVentas = await pleExportService.exportarLibro(empresaId, periodo, '140100', ruc, usuarioEfectivoId, { sinMovimiento: false, esOficial: true });
      assert.ok(pleVentas.nombreArchivo.startsWith('LE'), 'El nombre del archivo debe iniciar con LE');
      assert.ok(pleVentas.nombreArchivo.endsWith('.txt'), 'El archivo debe tener extensión .txt');
      console.log(`- PLE 5.2 Ventas generado: ${pleVentas.nombreArchivo} (${pleVentas.totalFilas} registros).`);

      console.log('✅ Generación de libros PLE oficiales verificada.\n');

      const mayorPreReinicio = await librosEEFFService.generarLibroMayor(empresaId, periodo);
      mayorTotalSumasDebe = mayorPreReinicio.totalSumasDebe;
    });

    // --- 6. PERSISTENCIA TRAS REINICIO EN FRÍO ---
    console.log('--- 6. PERSISTENCIA TRAS REINICIO EN FRÍO (DISCONNECT & RECONNECT) ---');
    client.release();
    await pool.end();

    const freshPool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
    setPostgresPool(freshPool, true);

    await conContextoEmpresa(empresaId, usuarioEfectivoId, async () => {
      const mayorPostReinicio = await librosEEFFService.generarLibroMayor(empresaId, periodo);
      const balancePostReinicio = await librosEEFFService.generarBalanceComprobacion(empresaId, periodo);

      assert.equal(mayorPostReinicio.totalSumasDebe, mayorTotalSumasDebe, 'Suma del mayor post reinicio debe ser idéntica');
      assert.equal(balancePostReinicio.totales.sumasDebe, mayorPostReinicio.totalSumasDebe, 'Balance de comprobación debe calcular idéntico tras reinicio');
    });

    console.log('✅ Persistencia en disco tras desconexión y reconexión verificada exitosamente.\n');

    // Limpieza
    const cleanClient = await freshPool.connect();
    try {
      await cleanClient.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false)", [empresaId]);
      await cleanClient.query('DELETE FROM aplicaciones_cobranza WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM aplicaciones_pago WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM cuentas_por_cobrar WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM cuentas_por_pagar WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM comprobantes_venta WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM comprobantes_compra WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM asiento_detalle WHERE asiento_id IN (SELECT id FROM asientos WHERE empresa_id = $1)', [empresaId]);
      await cleanClient.query('DELETE FROM asientos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM anexos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM plan_cuentas WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM subdiarios WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM periodos WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM ejercicios WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM membresias WHERE empresa_id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM empresas WHERE id = $1', [empresaId]);
      await cleanClient.query('DELETE FROM usuarios_estudio WHERE id = $1', [usuarioEfectivoId]);
      await cleanClient.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    } catch (e) {
      // Ignorar fallos no críticos de limpieza
    } finally {
      cleanClient.release();
      await freshPool.end();
    }

    console.log('========================================================================');
    console.log('🎉 FASE C COMPLETADA Y APROBADA AL 100% EN POSTGRESQL REAL (EXIT 0)');
    console.log('========================================================================');
  } catch (err) {
    console.error('❌ ERROR CRÍTICO EN PRUEBAS DE FASE C:', err);
    try { client.release(); } catch {}
    try { await pool.end(); } catch {}
    process.exit(1);
  }
}

ejecutar();
