import assert from 'assert';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { db, setPostgresPool, conContextoEmpresa } from '../../config/database';
import { env } from '../../config/env';
import { parametroRepository } from '../../repositories/parametroRepository';
import { pcgeService } from '../../services/pcgeService';
import { asientoService, ASIENTOS_MEMORIA } from '../../services/asientoService';
import { contabilizacionService } from '../../services/contabilizacionService';
import { cierreAnualService } from '../../services/cierreAnualService';
import { liquidacionIGVService } from '../../services/liquidacionIGVService';
import { djRentaAnualService } from '../../services/djRentaAnualService';
import { detraccionService } from '../../services/detraccionService';
import { honorariosService } from '../../services/honorariosService';
import { sireLayoutService, generarCarOficial } from '../../services/sireLayoutService';
import { sireService } from '../../services/sireService';
import { conciliadorSireService } from '../../services/conciliadorSireService';
import { pleExportService } from '../../services/pleExportService';
import { archivoValidadorService } from '../../services/archivoValidadorService';
import { COMPRAS_MEMORIA } from '../../services/compraService';
import { VENTAS_MEMORIA } from '../../services/ventaService';
import { Money } from '../../utils/decimal';

dotenv.config();
process.env.NODE_ENV = 'test';

const connectionString =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://contabilidad_app:Craxker29@localhost:5432/atlob_test';

async function main() {
  console.log('======================================================================');
  console.log(' FASE E: AUDITORIA NORMATIVA PERUANA 2026 SOBRE POSTGRESQL REAL');
  console.log('======================================================================');

  process.env.NODE_ENV = 'test';
  env.NODE_ENV = 'test';
  const pool = new Pool({ connectionString });
  setPostgresPool(pool, true);

  const tenantId = randomUUID();
  const userId = randomUUID();
  const empresaMypeId = randomUUID();
  const empresaRgId = randomUUID();
  const ejercicioMypeId = randomUUID();
  const ejercicioRgId = randomUUID();
  const periodoSepMypeId = randomUUID();
  const periodoOctMypeId = randomUUID();
  const periodoDicMypeId = randomUUID();
  const periodoSepRgId = randomUUID();

  const suffix = Date.now().toString().slice(-6);
  const rucMype = `20609${suffix}`; // 11 dígitos
  const rucRg = `20558${suffix}`;   // 11 dígitos

  const proveedorDomId = randomUUID();
  const proveedorNoDomId = randomUUID();
  const clienteId = randomUUID();

  try {
    // -------------------------------------------------------------------------
    // 0. SEMILLA BASE EN POSTGRESQL REAL (TENANT, USUARIO, EMPRESAS, PERIODOS)
    // -------------------------------------------------------------------------
    await pool.query(
      `INSERT INTO tenants (id, nombre, subdominio, estado)
       VALUES ($1, $2, $3, 'ACTIVO')`,
      [tenantId, `Estudio Auditoria Normativa 2026 ${suffix}`, `normativa2026-${suffix}`]
    );

    const rolRes = await pool.query(`SELECT id FROM roles WHERE codigo = 'CONTADOR' LIMIT 1`);
    assert.ok(rolRes.rows.length > 0, 'Debe existir el rol CONTADOR en PostgreSQL');
    const rolId = rolRes.rows[0].id;

    await pool.query(
      `INSERT INTO usuarios_estudio (id, email, password_hash, nombre, rol_global, is_active)
       VALUES ($1, $2, 'hash_fase_e', 'Auditor Normativo 2026', 'ADMINISTRADOR', true)`,
      [userId, `auditor.fase.e.${suffix}@atlob.test`]
    );

    await pool.query(
      `INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal, is_active)
       VALUES
       ($1, $2, $6, $3, 'CORPORACION MYPE NORMATIVA 2026 S.A.C.', 'MYPE_TRIBUTARIO', 'Av. Arequipa 2026, Lima', 'PEN', true),
       ($4, $2, $7, $5, 'INDUSTRIAS REGIMEN GENERAL 2026 S.A.A.', 'REGIMEN_GENERAL', 'Av. Javier Prado 2026, Lima', 'PEN', true)`,
      [empresaMypeId, tenantId, rucMype, empresaRgId, rucRg, `EMP-MYPE-${suffix}`, `EMP-RG-${suffix}`]
    );

    await conContextoEmpresa(empresaMypeId, userId, async () => {
      await db.query(
        `INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [randomUUID(), userId, empresaMypeId, rolId]
      );

      await db.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado)
         VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ejercicioMypeId, empresaMypeId]
      );

      await db.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES
         ($1, $2, $3, 2026, 9,  '2026-09', 'ABIERTO'),
         ($4, $2, $3, 2026, 10, '2026-10', 'ABIERTO'),
         ($5, $2, $3, 2026, 12, '2026-12', 'ABIERTO')`,
        [periodoSepMypeId, empresaMypeId, ejercicioMypeId, periodoOctMypeId, periodoDicMypeId]
      );
    });

    await conContextoEmpresa(empresaRgId, userId, async () => {
      await db.query(
        `INSERT INTO membresias (id, usuario_id, empresa_id, rol_id, is_active)
         VALUES ($1, $2, $3, $4, true)`,
        [randomUUID(), userId, empresaRgId, rolId]
      );

      await db.query(
        `INSERT INTO ejercicios (id, empresa_id, anio, estado)
         VALUES ($1, $2, 2026, 'ABIERTO')`,
        [ejercicioRgId, empresaRgId]
      );

      await db.query(
        `INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
         VALUES ($1, $2, $3, 2026, 9, '2026-09', 'ABIERTO')`,
        [periodoSepRgId, empresaRgId, ejercicioRgId]
      );
    });

    const subdiariosBase = [
      ['00', 'Apertura', 'APERTURA'],
      ['01', 'Compras', 'COMPRAS'],
      ['02', 'Ventas', 'VENTAS'],
      ['05', 'Caja y Bancos', 'BANCOS'],
      ['06', 'Honorarios', 'HONORARIOS'],
      ['07', 'Planilla', 'PLANILLA'],
      ['08', 'Diario / Ajustes', 'DESTINO'],
      ['09', 'Cierre Anual', 'CIERRE'],
      ['11', 'Destinos Automaticos', 'DESTINO'],
    ];
    for (const [cod, desc, tipo] of subdiariosBase) {
      await conContextoEmpresa(empresaMypeId, userId, async () => {
        await db.query(
          `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [randomUUID(), empresaMypeId, cod, desc, tipo]
        );
      });
      await conContextoEmpresa(empresaRgId, userId, async () => {
        await db.query(
          `INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [randomUUID(), empresaRgId, cod, desc, tipo]
        );
      });
    }

    // Sembrar cuentas PCGE 2019 Modificado necesarias para operaciones, destinos y cierre Elemento 8
    const cuentasPcge: Array<[string, string, number, string, boolean, string | null, string | null]> = [
      ['10', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 2, 'ACTIVO', false, null, null],
      ['101', 'Caja', 3, 'ACTIVO', false, null, null],
      ['10111', 'Caja Moneda Nacional', 5, 'ACTIVO', true, null, null],
      ['104', 'Cuentas corrientes en instituciones financieras', 3, 'ACTIVO', false, null, null],
      ['1041', 'Cuentas corrientes operativas', 4, 'ACTIVO', true, null, null],
      ['10411', 'Banco Operativo MN', 5, 'ACTIVO', true, null, null],
      ['12', 'CUENTAS POR COBRAR COMERCIALES - TERCEROS', 2, 'ACTIVO', false, null, null],
      ['121', 'Facturas, boletas y otros comprobantes por cobrar', 3, 'ACTIVO', false, null, null],
      ['1212', 'Emitidas en cartera', 4, 'ACTIVO', true, null, null],
      ['12121', 'Facturas por cobrar MN', 5, 'ACTIVO', true, null, null],
      ['20', 'MERCADERIAS', 2, 'ACTIVO', false, null, null],
      ['201', 'Mercaderías manufacturadas', 3, 'ACTIVO', false, null, null],
      ['2011', 'Mercaderías manufacturadas - Costo', 4, 'ACTIVO', true, null, null],
      ['20111', 'Mercaderías almacén central (Costo)', 5, 'ACTIVO', true, null, null],
      ['40', 'TRIBUTOS, CONTRAPRESTACIONES Y APORTES AL SISTEMA DE PENSIONES Y DE SALUD POR PAGAR', 2, 'PASIVO', false, null, null],
      ['401', 'Gobierno nacional', 3, 'PASIVO', false, null, null],
      ['4011', 'Impuesto general a las ventas', 4, 'PASIVO', false, null, null],
      ['40111', 'IGV - Cuenta propia', 5, 'PASIVO', true, null, null],
      ['4017', 'Impuesto a la renta', 4, 'PASIVO', false, null, null],
      ['40171', 'Renta de tercera categoría', 5, 'PASIVO', true, null, null],
      ['40172', 'Renta de cuarta categoría', 5, 'PASIVO', true, null, null],
      ['403', 'Instituciones públicas', 3, 'PASIVO', false, null, null],
      ['4031', 'ESSALUD', 4, 'PASIVO', true, null, null],
      ['4032', 'ONP', 4, 'PASIVO', true, null, null],
      ['42', 'CUENTAS POR PAGAR COMERCIALES - TERCEROS', 2, 'PASIVO', false, null, null],
      ['421', 'Facturas, boletas y otros comprobantes por pagar', 3, 'PASIVO', false, null, null],
      ['4212', 'Emitidas', 4, 'PASIVO', true, null, null],
      ['42121', 'Facturas por pagar MN', 5, 'PASIVO', true, null, null],
      ['424', 'Honorarios por pagar', 3, 'PASIVO', true, null, null],
      ['50', 'CAPITAL', 2, 'PATRIMONIO', false, null, null],
      ['501', 'Capital social', 3, 'PATRIMONIO', false, null, null],
      ['5011', 'Acciones', 4, 'PATRIMONIO', true, null, null],
      ['59', 'RESULTADOS ACUMULADOS', 2, 'PATRIMONIO', false, null, null],
      ['591', 'Utilidades no distribuidas', 3, 'PATRIMONIO', false, null, null],
      ['5911', 'Utilidades acumuladas', 4, 'PATRIMONIO', true, null, null],
      ['60', 'COMPRAS', 2, 'GASTO', false, null, null],
      ['601', 'Mercaderías', 3, 'GASTO', false, null, null],
      ['6011', 'Mercaderías manufacturadas', 4, 'GASTO', true, '20111', '6111'],
      ['60111', 'Compras Mercaderías Gravadas', 5, 'GASTO', true, '20111', '6111'],
      ['61', 'VARIACION DE INVENTARIOS', 2, 'GASTO', false, null, null],
      ['611', 'Mercaderías', 3, 'GASTO', false, null, null],
      ['6111', 'Mercaderías manufacturadas - Variación', 4, 'GASTO', true, null, null],
      ['62', 'GASTOS DE PERSONAL Y DIRECTORES', 2, 'GASTO', false, null, null],
      ['621', 'Remuneraciones', 3, 'GASTO', false, null, null],
      ['6211', 'Sueldos y salarios', 4, 'GASTO', true, '941', '791'],
      ['627', 'Seguridad, previsión social y otras contribuciones', 3, 'GASTO', false, null, null],
      ['6271', 'Régimen de prestaciones de salud - EsSalud', 4, 'GASTO', true, '941', '791'],
      ['63', 'GASTOS DE SERVICIOS PRESTADOS POR TERCEROS', 2, 'GASTO', false, null, null],
      ['631', 'Transporte, correos y gastos de viaje', 3, 'GASTO', false, null, null],
      ['6311', 'Transporte de carga y servicios', 4, 'GASTO', true, '941', '791'],
      ['632', 'Asesoría y consultoría', 3, 'GASTO', false, null, null],
      ['6321', 'Asesoría administrativa y contable', 4, 'GASTO', true, '941', '791'],
      ['64', 'GASTOS POR TRIBUTOS', 2, 'GASTO', false, null, null],
      ['641', 'Gobierno nacional', 3, 'GASTO', false, null, null],
      ['6411', 'Impuesto general a las ventas y selectivo', 4, 'GASTO', true, '941', '791'],
      ['6412', 'Impuesto a las transacciones financieras - ITF', 4, 'GASTO', true, '941', '791'],
      ['65', 'OTROS GASTOS DE GESTION', 2, 'GASTO', false, null, null],
      ['651', 'Seguros', 3, 'GASTO', false, null, null],
      ['6511', 'Seguros patrimoniales', 4, 'GASTO', true, '941', '791'],
      ['67', 'GASTOS FINANCIEROS', 2, 'GASTO', false, null, null],
      ['676', 'Diferencia de cambio', 3, 'GASTO', false, null, null],
      ['6761', 'Diferencia de cambio negativa', 4, 'GASTO', true, null, null],
      ['68', 'VALUACION Y DETERIORO DE ACTIVOS Y PROVISIONES', 2, 'GASTO', false, null, null],
      ['681', 'Depreciación de propiedades, planta y equipo', 3, 'GASTO', false, null, null],
      ['6811', 'Depreciación de edificaciones y equipos', 4, 'GASTO', true, '941', '791'],
      ['69', 'COSTO DE VENTAS', 2, 'GASTO', false, null, null],
      ['691', 'Mercaderías', 3, 'GASTO', false, null, null],
      ['6911', 'Mercaderías - Terceros', 4, 'GASTO', true, null, null],
      ['70', 'VENTAS', 2, 'INGRESO', false, null, null],
      ['701', 'Mercaderías', 3, 'INGRESO', false, null, null],
      ['7011', 'Mercaderías manufacturadas', 4, 'INGRESO', false, null, null],
      ['70111', 'Ventas de Mercaderías - Terceros', 5, 'INGRESO', true, null, null],
      ['75', 'OTROS INGRESOS DE GESTION', 2, 'INGRESO', false, null, null],
      ['751', 'Servicios en beneficio del personal', 3, 'INGRESO', false, null, null],
      ['7511', 'Otros ingresos operativos', 4, 'INGRESO', true, null, null],
      ['77', 'INGRESOS FINANCIEROS', 2, 'INGRESO', false, null, null],
      ['776', 'Diferencia en cambio', 3, 'INGRESO', false, null, null],
      ['7761', 'Diferencia en cambio positiva', 4, 'INGRESO', true, null, null],
      ['79', 'CARGAS IMPUTABLES A CUENTAS DE COSTOS Y GASTOS', 2, 'FUNCION', false, null, null],
      ['791', 'Cargas imputables a cuentas de costos y gastos', 3, 'FUNCION', true, null, null],
      ['80', 'MARGEN COMERCIAL', 2, 'ORDEN', false, null, null],
      ['801', 'Margen comercial', 3, 'ORDEN', true, null, null],
      ['82', 'VALOR AGREGADO', 2, 'ORDEN', false, null, null],
      ['821', 'Valor agregado', 3, 'ORDEN', true, null, null],
      ['83', 'EXCEDENTE BRUTO (INSUFICIENCIA BRUTA) DE EXPLOTACION', 2, 'ORDEN', false, null, null],
      ['831', 'Excedente bruto de explotación', 3, 'ORDEN', true, null, null],
      ['84', 'RESULTADO DE EXPLOTACION', 2, 'ORDEN', false, null, null],
      ['841', 'Resultado de explotación', 3, 'ORDEN', true, null, null],
      ['85', 'RESULTADO ANTES DE PARTICIPACIONES E IMPUESTOS', 2, 'ORDEN', false, null, null],
      ['851', 'Resultado antes de impuesto a las ganancias', 3, 'ORDEN', true, null, null],
      ['88', 'IMPUESTO A LA RENTA', 2, 'ORDEN', false, null, null],
      ['881', 'Impuesto a las ganancias - Corriente', 3, 'ORDEN', true, null, null],
      ['89', 'DETERMINACION DEL RESULTADO DEL EJERCICIO', 2, 'ORDEN', false, null, null],
      ['891', 'Utilidad', 3, 'ORDEN', true, null, null],
      ['94', 'GASTOS DE ADMINISTRACION', 2, 'FUNCION', false, null, null],
      ['941', 'Gastos generales de administración', 3, 'FUNCION', true, null, null],
      ['95', 'GASTOS DE VENTAS', 2, 'FUNCION', false, null, null],
      ['951', 'Gastos de ventas y distribución', 3, 'FUNCION', true, null, null],
    ];

    await conContextoEmpresa(empresaMypeId, userId, async () => {
      for (const [codigo, nombre, nivel, tipo, permiteMov, destDebe, destHaber] of cuentasPcge) {
        await db.query(
          `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, cuenta_destino_debe, cuenta_destino_haber, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
           ON CONFLICT (empresa_id, codigo) DO NOTHING`,
          [randomUUID(), empresaMypeId, codigo, nombre, nivel, tipo, permiteMov, destDebe, destHaber]
        );
      }

      await db.query(
        `INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad, is_active)
         VALUES
         ($1, $2, '6', '20100070970', 'PROVEEDOR NACIONAL S.A.C.', 'PROVEEDOR', true),
         ($3, $2, '0', '999888777',   'CLOUD SERVICES INC (NO DOMICILIADO)', 'PROVEEDOR', true),
         ($4, $2, '6', '20500040301', 'CLIENTE CORPORATIVO PERU S.A.C.', 'CLIENTE', true)`,
        [proveedorDomId, empresaMypeId, proveedorNoDomId, clienteId]
      );
    });

    await conContextoEmpresa(empresaRgId, userId, async () => {
      for (const [codigo, nombre, nivel, tipo, permiteMov, destDebe, destHaber] of cuentasPcge) {
        await db.query(
          `INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, cuenta_destino_debe, cuenta_destino_haber, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
           ON CONFLICT (empresa_id, codigo) DO NOTHING`,
          [randomUUID(), empresaRgId, codigo, nombre, nivel, tipo, permiteMov, destDebe, destHaber]
        );
      }
    });

    // =========================================================================
    // BLOQUE 1: PARÁMETROS NORMATIVOS 2026 EN POSTGRESQL REAL
    // =========================================================================
    console.log('\n[BLOQUE 1] Verificando Parámetros Tributarios y Laborales 2026 en PostgreSQL...');

    const parametrosOficiales2026: Array<[string, string, number, string, string | null, string]> = [
      ['VALOR_UIT_2026', 'Valor oficial UIT 2026 (D.S. N° 301-2025-EF)', 5500.00, '2026-01-01', '2026-12-31', 'UIT'],
      ['UIT', 'Valor oficial UIT 2026 vigente', 5500.00, '2026-01-01', null, 'UIT'],
      ['RMV', 'Remuneración Mínima Vital 2025-2026 (D.S. N° 006-2024-TR)', 1130.00, '2025-01-01', '2026-09-30', 'LABORAL'],
      ['TASA_IGV_PURO', 'Tasa Impuesto General a las Ventas sin IPM (16%)', 0.16, '2011-03-01', null, 'IGV'],
      ['TASA_IPM', 'Tasa Impuesto de Promoción Municipal IPM (2%)', 0.02, '2011-03-01', null, 'IGV'],
      ['TASA_IGV', 'Tasa General IGV (16%) + IPM (2%) = 18%', 0.18, '2011-03-01', null, 'IGV'],
      ['TASA_ESSALUD', 'Aporte Patronal EsSalud (9%)', 0.09, '2020-01-01', null, 'LABORAL'],
      ['TASA_ONP', 'Aporte Obligatorio Sistema Nacional de Pensiones ONP (13%)', 0.13, '2020-01-01', null, 'LABORAL'],
      ['TASA_RETENCION_4TA', 'Tasa Retención 4ta Categoría Recibos por Honorarios (8%)', 0.08, '2015-01-01', null, 'RENTA'],
      ['TOPE_RETENCION_4TA', 'Monto tope exonerado Retención 4ta Categoría por recibo (S/ 1,500)', 1500.00, '2007-01-01', null, 'RENTA'],
      ['TASA_ITF_PCT', 'Tasa Impuesto a las Transacciones Financieras ITF en porcentaje (0.005%)', 0.0050, '2011-04-01', null, 'RENTA'],
      ['TASA_RETENCION_IGV', 'Tasa Régimen de Retenciones del IGV (3%)', 0.03, '2014-03-01', null, 'IGV'],
      ['TASA_RENTA_MYPE_SUB300', 'Pago a cuenta mensual MYPE Tributario hasta 300 UIT (1.0%)', 0.01, '2017-01-01', null, 'RENTA'],
      ['TOPE_RENTA_MYPE_MENSUAL_UIT', 'Tope ingresos netos anuales para tasa 1.0% MYPE (300 UIT)', 300.00, '2017-01-01', null, 'RENTA'],
      ['TASA_RENTA_RG_MIN', 'Pago a cuenta mínimo mensual Régimen General / MYPE > 300 UIT (1.5%)', 0.015, '2015-01-01', null, 'RENTA'],
      ['TASA_RENTA_ANUAL_MYPE_T1', 'Tasa Anual Renta MYPE Tributario Tramo 1 hasta 15 UIT (10%)', 0.10, '2017-01-01', null, 'RENTA'],
      ['TRAMO_RENTA_ANUAL_MYPE_UIT', 'Tope del primer tramo Renta Anual MYPE en UIT (15 UIT)', 15.00, '2017-01-01', null, 'RENTA'],
      ['TASA_RENTA_ANUAL_GENERAL', 'Tasa Anual Impuesto a la Renta Régimen General y exceso MYPE (29.5%)', 0.295, '2017-01-01', null, 'RENTA'],
    ];

    for (const [cod, desc, val, desde, hasta, cat] of parametrosOficiales2026) {
      await pool.query(
        `INSERT INTO parametros_tributarios (codigo_parametro, descripcion, valor_numerico, vigente_desde, vigente_hasta, categoria)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo_parametro, vigente_desde)
         DO UPDATE SET descripcion = EXCLUDED.descripcion, valor_numerico = EXCLUDED.valor_numerico, vigente_hasta = EXCLUDED.vigente_hasta`,
        [cod, desc, val, desde, hasta, cat]
      );
    }

    const uit2026 = await parametroRepository.obtenerUitPorAnio(2026);
    const rmv2026 = await parametroRepository.obtenerRmvPorPeriodo('2026-06');
    const tasaIgvPuro = await parametroRepository.obtenerValorNumerico('TASA_IGV_PURO', 0, '2026-09-15');
    const tasaIpm = await parametroRepository.obtenerValorNumerico('TASA_IPM', 0, '2026-09-15');
    const tasaIgvTotal = await parametroRepository.obtenerValorNumerico('TASA_IGV', 0, '2026-09-15');
    const tasaEssalud = await parametroRepository.obtenerValorNumerico('TASA_ESSALUD', 0, '2026-09-15');
    const tasaOnp = await parametroRepository.obtenerValorNumerico('TASA_ONP', 0, '2026-09-15');
    const tasaRet4ta = await parametroRepository.obtenerValorNumerico('TASA_RETENCION_4TA', 0, '2026-09-15');
    const topeRet4ta = await parametroRepository.obtenerValorNumerico('TOPE_RETENCION_4TA', 0, '2026-09-15');
    const tasaItfPct = await parametroRepository.obtenerValorNumerico('TASA_ITF_PCT', 0, '2026-09-15');
    const tasaItfFactor = Money.create(tasaItfPct).dividedBy(100).toNumber(); // 0.005% = 0.00005

    assert.strictEqual(uit2026, 5500, 'UIT 2026 debe ser exactamente S/ 5,500.00');
    assert.strictEqual(rmv2026, 1130, 'RMV vigente en 2026-06 debe ser exactamente S/ 1,130.00');
    assert.strictEqual(tasaIgvPuro, 0.16, 'IGV puro debe ser 16% (0.16)');
    assert.strictEqual(tasaIpm, 0.02, 'IPM debe ser 2% (0.02)');
    assert.strictEqual(Money.toNumber(Money.add(tasaIgvPuro, tasaIpm)), 0.18, 'IGV (16%) + IPM (2%) debe sumar 18% (0.18)');
    assert.strictEqual(tasaIgvTotal, 0.18, 'Tasa total IGV debe ser 18% (0.18)');
    assert.strictEqual(tasaEssalud, 0.09, 'Tasa EsSalud debe ser 9% (0.09)');
    assert.strictEqual(tasaOnp, 0.13, 'Tasa ONP debe ser 13% (0.13)');
    assert.strictEqual(tasaRet4ta, 0.08, 'Retención 4ta Categoría debe ser 8% (0.08)');
    assert.strictEqual(topeRet4ta, 1500, 'Tope Retención 4ta Categoría debe ser S/ 1,500.00');
    assert.strictEqual(tasaItfPct, 0.005, 'Tasa ITF en porcentaje debe ser 0.005%');
    assert.strictEqual(tasaItfFactor, 0.00005, 'Factor decimal ITF debe ser 0.00005 (0.005%)');

    // Validar cálculo real de Recibo por Honorarios (4ta Categoría: 8% sobre > S/ 1,500) en contexto de empresa
    await conContextoEmpresa(empresaMypeId, userId, async () => {
      const rxh1500 = await honorariosService.registrarRecibo(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          proveedorId: proveedorDomId,
          serie: 'E001',
          numero: '00000101',
          fechaEmision: '2026-09-05',
          importeBruto: 1500.00,
          suspensionCuarta: false,
        },
        userId
      );
      assert.strictEqual(rxh1500.retencion, 0, 'RxH hasta S/ 1,500.00 no debe sufrir retención de 4ta categoría');
      assert.strictEqual(rxh1500.netoPagar, 1500.00, 'RxH de S/ 1,500.00 debe pagar neto S/ 1,500.00');

      const rxh2500 = await honorariosService.registrarRecibo(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          proveedorId: proveedorDomId,
          serie: 'E001',
          numero: '00000102',
          fechaEmision: '2026-09-06',
          importeBruto: 2500.00,
          suspensionCuarta: false,
        },
        userId
      );
      assert.strictEqual(rxh2500.aplicaRetencion, true, 'RxH > S/ 1,500.00 sin suspensión debe aplicar retención 8%');
      assert.strictEqual(rxh2500.retencion, 200.00, 'Retención 8% de S/ 2,500.00 debe ser S/ 200.00');
      assert.strictEqual(rxh2500.netoPagar, 2300.00, 'Monto neto de RxH S/ 2,500.00 debe ser S/ 2,300.00');

      const rxhSuspendido = await honorariosService.registrarRecibo(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          proveedorId: proveedorDomId,
          serie: 'E001',
          numero: '00000103',
          fechaEmision: '2026-09-07',
          importeBruto: 5000.00,
          suspensionCuarta: true,
          numeroResolucionSuspension: 'RES-2026-009988',
        },
        userId
      );
      assert.strictEqual(rxhSuspendido.retencion, 0, 'RxH con constancia de suspensión vigente no retiene 4ta');
    });

    // Validar cálculo de ITF 0.005% sobre operación bancaria de S/ 100,000.00 -> S/ 5.00
    const itfSobre100k = Money.toNumber(Money.round(Money.mul(100000, tasaItfFactor)));
    assert.strictEqual(itfSobre100k, 5.00, 'ITF (0.005%) sobre S/ 100,000.00 debe ser S/ 5.00');

    console.log('  ✅ [OK] Parámetros 2026: UIT=5500, RMV=1130, IGV=16%+2%=18%, EsSalud=9%, ONP=13%, 4ta=8% (tope 1500), ITF=0.005%.');

    // =========================================================================
    // BLOQUE 2: PCGE 2019 MODIFICADO, PARTIDA DOBLE, DESTINOS Y CIERRE ELEMENTO 8
    // =========================================================================
    console.log('\n[BLOQUE 2] Verificando PCGE 2019 Modificado, Partida Doble, Destinos y Cierre Anual (Elemento 8)...');

    await conContextoEmpresa(empresaMypeId, userId, async () => {
      // 2.1 Estructura jerárquica de cuentas PCGE 2019 Modificado
      const nuevaSubcuenta = await pcgeService.crearSubcuenta(
        empresaMypeId,
        {
          codigo: '10419',
          nombre: 'Banco de la Nación - Cuenta Detracciones MN',
          esRegistro: true,
          naturalezaSaldo: 'DEUDORA',
        }
      );
      assert.strictEqual(nuevaSubcuenta.codigo, '10419', 'Subcuenta 10419 creada exitosamente bajo divisionaria 1041');

      // Rechazo de subcuenta huérfana sin cuenta padre
      let rechazoHuerfana = false;
      try {
        await pcgeService.crearSubcuenta(
          empresaMypeId,
          {
            codigo: '99999',
            nombre: 'Subcuenta sin padre 9999',
          }
        );
      } catch (err: any) {
        rechazoHuerfana = String(err.message).includes('JERARQUIA_INVALIDA') || String(err.message).includes('PADRE');
      }
      assert.strictEqual(rechazoHuerfana, true, 'El motor PCGE debe rechazar subcuentas sin divisionaria padre');

      // 2.2 Partida doble estricta (debe == haber)
      let rechazoDescuadre = false;
      try {
        await asientoService.crearAsiento(
          empresaMypeId,
          {
            periodoId: periodoSepMypeId,
            subdiarioId: '08',
            fecha: '2026-09-05',
            glosa: 'Asiento descuadrado de prueba',
            moneda: 'PEN',
            tipoCambio: 1,
            origen: 'MANUAL',
            estado: 'CONTABILIZADO',
            detalles: [
              { cuentaId: '1041', glosaLinea: 'Cargo', debe: 1000, haber: 0 },
              { cuentaId: '5011', glosaLinea: 'Abono incompleto', debe: 0, haber: 950 },
            ],
          },
          userId
        );
      } catch (err: any) {
        rechazoDescuadre = String(err.message).includes('ASIENTO_DESCUADRADO') || String(err.message).includes('PARTIDA_DOBLE');
      }
      assert.strictEqual(rechazoDescuadre, true, 'Debe rechazar asientos donde Debe != Haber');

      // 2.3 Generación automática de asientos de destino:
      // Caso A: Compra de Mercadería (Elemento 6: 6011 -> Destino Elemento 2: 2011 Debe vs 6111 Haber)
      const genMercaderia = await contabilizacionService.generar(
        empresaMypeId,
        'COMPRA_MERCADERIA',
        {
          glosa: 'Compra de mercaderías gravadas con destino almacén',
          moneda: 'PEN',
          tipoCambio: 1,
          baseImponible: 20000.00,
          igv: 3600.00,
          total: 23600.00,
          anexoId: proveedorDomId,
          docTipo: '01',
          docSerie: 'F001',
          docNumero: '00001001',
        }
      );
      assert.strictEqual(genMercaderia.cuadrado, true, 'Propuesta de compra de mercadería + destino debe estar cuadrada');
      const tiene2011Debe = genMercaderia.lineas.some((l) => l.codigoCuenta.startsWith('2011') && Number(l.debe) === 20000);
      const tiene6111Haber = genMercaderia.lineas.some((l) => l.codigoCuenta.startsWith('6111') && Number(l.haber) === 20000);
      assert.strictEqual(tiene2011Debe && tiene6111Haber, true, 'Destino almacén debe cargar 2011 y abonar 6111 por S/ 20,000.00');

      await asientoService.crearAsiento(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          subdiario: '01',
          fecha: '2026-09-10',
          glosa: genMercaderia.glosaGeneral,
          moneda: 'PEN',
          tipoCambio: 1,
          origenModulo: 'COMPRA',
          lineas: genMercaderia.lineas,
        },
        userId
      );

      // Caso B: Compra de Servicio (Elemento 6: 6321 -> Destino Elemento 9: 941/951 Debe vs 791 Haber)
      const genServicio = await contabilizacionService.generar(
        empresaMypeId,
        'COMPRA_SERVICIO',
        {
          glosa: 'Servicio de asesoría y transporte empresarial',
          moneda: 'PEN',
          tipoCambio: 1,
          baseImponible: 5000.00,
          igv: 900.00,
          total: 5900.00,
          anexoId: proveedorDomId,
          docTipo: '01',
          docSerie: 'F002',
          docNumero: '00002002',
          porcentajeAdmin: 60,
          porcentajeVentas: 40,
        }
      );
      assert.strictEqual(genServicio.cuadrado, true, 'Propuesta de compra de servicio + destino función debe estar cuadrada');
      const cargo941 = genServicio.lineas.find((l) => l.codigoCuenta === '941');
      const cargo951 = genServicio.lineas.find((l) => l.codigoCuenta === '951');
      const abono791 = genServicio.lineas.find((l) => l.codigoCuenta === '791');
      assert.strictEqual(Number(cargo941?.debe), 3000.00, 'Destino 941 (60%) debe ser S/ 3,000.00');
      assert.strictEqual(Number(cargo951?.debe), 2000.00, 'Destino 951 (40%) debe ser S/ 2,000.00');
      assert.strictEqual(Number(abono791?.haber), 5000.00, 'Abono 791 (Cargas Imputables) debe ser S/ 5,000.00');

      await asientoService.crearAsiento(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          subdiario: '01',
          fecha: '2026-09-12',
          glosa: genServicio.glosaGeneral,
          moneda: 'PEN',
          tipoCambio: 1,
          origenModulo: 'COMPRA',
          lineas: genServicio.lineas,
        },
        userId
      );

      // Registrar una venta contable en el ejercicio 2026 para tener utilidad antes del cierre anual Elemento 8
      await asientoService.crearAsiento(
        empresaMypeId,
        {
          periodoId: periodoSepMypeId,
          subdiarioId: '02',
          fecha: '2026-09-20',
          glosa: 'Venta de mercaderías del ejercicio 2026',
          moneda: 'PEN',
          tipoCambio: 1,
          origen: 'VENTAS',
          estado: 'CONTABILIZADO',
          detalles: [
            { cuentaId: '1212', glosaLinea: 'Factura por cobrar', debe: 59000.00, haber: 0 },
            { cuentaId: '40111', glosaLinea: 'IGV Débito Fiscal', debe: 0, haber: 9000.00 },
            { cuentaId: '70111', glosaLinea: 'Ventas de mercaderías', debe: 0, haber: 50000.00 },
          ],
        },
        userId
      );

      // 2.4 Cierre Anual PCGE Elemento 8 (Cuentas 80 a 89 -> 5911 Resultados Acumulados)
      const simCierre = await cierreAnualService.simularCierreAnual(empresaMypeId, 2026);
      assert.strictEqual(simCierre.asientos.length, 8, 'La simulación de cierre anual debe proponer los 8 pasos del Elemento 8 y Balance');

      const ejecucionCierre = await cierreAnualService.ejecutarCierreAnual(empresaMypeId, 2026, userId);
      assert.strictEqual(ejecucionCierre.ok, true, 'El cierre anual 2026 debe ejecutarse exitosamente');
      assert.strictEqual(ejecucionCierre.asientosCreados, 8, 'Se deben persistir los 8 asientos de cierre anual');

      // Verificar en PostgreSQL real los asientos de cierre (Subdiario 09) y las cuentas 801..891 -> 5911
      const resCierrePg = await db.query(
        `SELECT a.id, a.numero, a.glosa,
                SUM(ad.debe)::numeric as total_debe,
                SUM(ad.haber)::numeric as total_haber,
                ARRAY_AGG(pc.codigo) as cuentas
         FROM asientos a
         JOIN subdiarios s ON s.id = a.subdiario_id
         JOIN asiento_detalle ad ON ad.asiento_id = a.id
         JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
         WHERE a.empresa_id = $1 AND s.codigo = '09' AND a.estado = 'CONTABILIZADO'
         GROUP BY a.id, a.numero, a.glosa
         ORDER BY a.numero ASC`,
        [empresaMypeId]
      );
      assert.strictEqual(resCierrePg.rows.length, 8, 'Los 8 asientos de cierre Elemento 8 deben estar persistidos en PostgreSQL real');
      for (const row of resCierrePg.rows) {
        assert.strictEqual(
          Number(row.total_debe).toFixed(2),
          Number(row.total_haber).toFixed(2),
          `Asiento de cierre ${row.numero} debe cumplir partida doble estricta en PostgreSQL`
        );
      }
      const todasCuentasCierre = resCierrePg.rows.flatMap((r: any) => r.cuentas);
      for (const ctaRequerida of ['801', '821', '831', '841', '851', '881', '891', '5911']) {
        assert.ok(
          todasCuentasCierre.includes(ctaRequerida),
          `El cierre anual en PostgreSQL debe incluir la cuenta oficial PCGE ${ctaRequerida}`
        );
      }
    });

    console.log('  ✅ [OK] PCGE 2019 Modificado: Jerarquía validada, partida doble estricta, destinos (60->20/61 y 63->94/95/79) y Cierre Anual (80..89->5911) en PostgreSQL.');

    // =========================================================================
    // BLOQUE 3: TRIBUTACIÓN MENSUAL (PDT 621) Y ANUAL (RMT 10%/29.5% Y RG 29.5%)
    // =========================================================================
    console.log('\n[BLOQUE 3] Verificando Liquidación Mensual PDT 621 y DJ Renta Anual (MYPE y Régimen General) en PostgreSQL...');

    await conContextoEmpresa(empresaMypeId, userId, async () => {
      // 3.1 Periodo 2026-09: Compras mayores que Ventas -> Genera Saldo a Favor Crédito Fiscal
      // Compras gravadas = S/ 20,000 (IGV = S/ 3,600) | Ventas gravadas = S/ 10,000 (IGV = S/ 1,800)
      const compraSepId = randomUUID();
      const ventaSepId = randomUUID();

      await db.query(
        `INSERT INTO comprobantes_compra (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, proveedor_id, moneda, tipo_cambio,
           base_gravada, igv, total, tipo_adquisicion, forma_pago, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-09-08', '2026-09-08', '2026-09-08', '01', 'F001', '00009001', $4, 'PEN', 1.0000, 20000.00, 3600.00, 23600.00, '1', 'CONTADO', 'REGISTRADO', 'MANUAL', $5)`,
        [compraSepId, empresaMypeId, periodoSepMypeId, proveedorDomId, userId]
      );

      await db.query(
        `INSERT INTO comprobantes_venta (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, cliente_id, moneda, tipo_cambio,
           base_gravada, igv, total, tipo_operacion, forma_pago, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-09-15', '2026-09-15', '2026-09-15', '01', 'F001', '00005001', $4, 'PEN', 1.0000, 10000.00, 1800.00, 11800.00, 'VENTA_INTERNA', 'CONTADO', 'REGISTRADO', 'MANUAL', $5)`,
        [ventaSepId, empresaMypeId, periodoSepMypeId, clienteId, userId]
      );

      const pdtSep = await liquidacionIGVService.calcular(empresaMypeId, '2026-09', {
        regimenOverride: 'MYPE_TRIBUTARIO',
        ingresosAcumuladosAnioUIT: 120, // <= 300 UIT -> Tasa 1.0%
      });

      assert.strictEqual(pdtSep.debitoFiscalIgv, 1800.00, 'PDT 621 (2026-09): Débito fiscal debe ser S/ 1,800.00');
      assert.strictEqual(pdtSep.creditoFiscalIgv, 3600.00, 'PDT 621 (2026-09): Crédito fiscal debe ser S/ 3,600.00');
      assert.strictEqual(pdtSep.igvDeterminado, -1800.00, 'PDT 621 (2026-09): Saldo a favor del período debe ser S/ -1,800.00');
      assert.strictEqual(pdtSep.nuevoSaldoAFavor, 1800.00, 'PDT 621 (2026-09): Nuevo saldo a favor arrastrable debe ser S/ 1,800.00');
      assert.strictEqual(pdtSep.igvPorPagar, 0, 'PDT 621 (2026-09): IGV a pagar debe ser S/ 0.00');
      assert.strictEqual(pdtSep.tasaRentaAplicada, 0.01, 'PDT 621 (2026-09): Tasa Renta MYPE <= 300 UIT debe ser 1.0% (0.01)');
      assert.strictEqual(pdtSep.pagoCuentaRenta, 100.00, 'PDT 621 (2026-09): Pago a cuenta Renta 1.0% de S/ 10,000 debe ser S/ 100.00');

      // 3.2 Periodo 2026-10: Ventas mayores que Compras + Arrastre automático de Saldo a Favor de 2026-09 + Retención 3% + Percepción 2%
      // Ventas gravadas = S/ 30,000 (IGV Débito = S/ 5,400) | Compras gravadas = S/ 10,000 (IGV Crédito = S/ 1,800)
      const compraOctId = randomUUID();
      const ventaOctId = randomUUID();

      await db.query(
        `INSERT INTO comprobantes_compra (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, proveedor_id, moneda, tipo_cambio,
           base_gravada, igv, total, tipo_adquisicion, forma_pago, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-10-10', '2026-10-10', '2026-10-10', '01', 'F001', '00009002', $4, 'PEN', 1.0000, 10000.00, 1800.00, 11800.00, '1', 'CONTADO', 'REGISTRADO', 'MANUAL', $5)`,
        [compraOctId, empresaMypeId, periodoOctMypeId, proveedorDomId, userId]
      );

      await db.query(
        `INSERT INTO comprobantes_venta (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, cliente_id, moneda, tipo_cambio,
           base_gravada, igv, total, tipo_operacion, forma_pago, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-10-18', '2026-10-18', '2026-10-18', '01', 'F001', '00005002', $4, 'PEN', 1.0000, 30000.00, 5400.00, 35400.00, 'VENTA_INTERNA', 'CONTADO', 'REGISTRADO', 'MANUAL', $5)`,
        [ventaOctId, empresaMypeId, periodoOctMypeId, clienteId, userId]
      );

      // Registrar Retención IGV (3% sobre S/ 10,000 = S/ 300.00) y Percepción IGV (2% sobre S/ 5,000 = S/ 100.00) en PostgreSQL y servicio
      await db.query(
        `INSERT INTO retenciones_percepciones_igv (
           id, empresa_id, tipo, comprobante_id, anexo_id, serie_documento, numero_documento,
           fecha_emision, porcentaje, monto, periodo_aplicacion, estado
         ) VALUES
         ($1, $2, 'RETENCION_COMPRA', $3, $4, 'R001', '00000123', '2026-10-20', 3.00, 300.00, '2026-10', 'PENDIENTE'),
         ($5, $2, 'PERCEPCION_VENTA', $6, $7, 'P001', '00000456', '2026-10-21', 2.00, 100.00, '2026-10', 'PENDIENTE')`,
        [randomUUID(), empresaMypeId, ventaOctId, clienteId, randomUUID(), compraOctId, proveedorDomId]
      );

      // En 2026-10 probamos además el tramo MYPE > 300 UIT (350 UIT -> aplica 1.5%)
      const pdtOct = await liquidacionIGVService.calcular(empresaMypeId, '2026-10', {
        regimenOverride: 'MYPE_TRIBUTARIO',
        ingresosAcumuladosAnioUIT: 350, // > 300 UIT -> Tasa 1.5%
      });

      assert.strictEqual(pdtOct.debitoFiscalIgv, 5400.00, 'PDT 621 (2026-10): Débito fiscal debe ser S/ 5,400.00');
      assert.strictEqual(pdtOct.creditoFiscalIgv, 1800.00, 'PDT 621 (2026-10): Crédito fiscal debe ser S/ 1,800.00');
      assert.strictEqual(pdtOct.igvDeterminado, 3600.00, 'PDT 621 (2026-10): IGV resultante del mes debe ser S/ 3,600.00');
      assert.strictEqual(pdtOct.saldoAnteriorAFavor, 1800.00, 'PDT 621 (2026-10): Debe arrastrar automáticamente S/ 1,800.00 de saldo a favor de 2026-09');
      assert.strictEqual(pdtOct.retencionesAplicables, 300.00, 'PDT 621 (2026-10): Retenciones IGV (3%) deben sumar S/ 300.00');
      assert.strictEqual(pdtOct.percepcionesAplicables, 100.00, 'PDT 621 (2026-10): Percepciones IGV deben sumar S/ 100.00');
      assert.strictEqual(pdtOct.igvPorPagar, 1400.00, 'PDT 621 (2026-10): IGV neto a pagar (3600 - 1800 - 300 - 100) debe ser S/ 1,400.00');
      assert.strictEqual(pdtOct.tasaRentaAplicada, 0.015, 'PDT 621 (2026-10): Tasa Renta MYPE > 300 UIT debe ser 1.5% (0.015)');
      assert.strictEqual(pdtOct.pagoCuentaRenta, 450.00, 'PDT 621 (2026-10): Pago a cuenta Renta 1.5% de S/ 30,000 debe ser S/ 450.00');

      // 3.3 DJ Renta Anual 2026 - Régimen MYPE Tributario (10% primeras 15 UIT = S/ 82,500; 29.5% exceso)
      // Utilidad contable S/ 95,000 + Adiciones S/ 5,000 = Renta Neta Imponible S/ 100,000.00
      // Primer tramo: 15 UIT = 15 * 5,500 = S/ 82,500 * 10% = S/ 8,250.00
      // Segundo tramo: (100,000 - 82,500) = S/ 17,500 * 29.5% = S/ 5,162.50
      // Total Impuesto a la Renta Anual MYPE = S/ 13,412.50
      const djMype = await djRentaAnualService.calcularDjAnual(empresaMypeId, 2026, {
        regimen: 'MYPE_TRIBUTARIO',
        utilidadContableOverride: 95000.00,
        reemplazarAdicionesBase: true,
        adicionesManuales: [
          {
            id: 'ad-test-1',
            codigo: 'AD-TEST',
            descripcion: 'Gastos sin sustento fehaciente Art. 37 LIR',
            baseLegal: 'Art. 37 y 44 TUO LIR',
            monto: 5000.00,
          },
        ],
        reemplazarDeduccionesBase: true,
        deduccionesManuales: [],
        pagosACuentaMensualesOverride: 5412.50,
        saldoAFavorAnterior: 0,
      });

      assert.strictEqual(djMype.uitAplicable, 5500, 'DJ Anual MYPE debe usar UIT 2026 = S/ 5,500');
      assert.strictEqual(djMype.rentaNetaImponible, 100000.00, 'Renta neta imponible MYPE debe ser S/ 100,000.00');
      assert.strictEqual(djMype.tramosCalculo[0].baseAfecta, 82500.00, 'Primer tramo 15 UIT debe ser S/ 82,500.00');
      assert.strictEqual(djMype.tramosCalculo[0].impuestoTramo, 8250.00, 'Impuesto tramo 10% (primeras 15 UIT) debe ser S/ 8,250.00');
      assert.strictEqual(djMype.tramosCalculo[1].baseAfecta, 17500.00, 'Exceso sobre 15 UIT debe ser S/ 17,500.00');
      assert.strictEqual(djMype.tramosCalculo[1].impuestoTramo, 5162.50, 'Impuesto tramo 29.5% sobre exceso debe ser S/ 5,162.50');
      assert.strictEqual(djMype.impuestoRentaCalculado, 13412.50, 'Impuesto a la Renta Anual MYPE total debe ser S/ 13,412.50');
      assert.strictEqual(djMype.saldoPorRegularizar, 8000.00, 'Saldo por regularizar a SUNAT (13,412.50 - 5,412.50) debe ser S/ 8,000.00');
    });

    // 3.4 DJ Renta Anual 2026 y Pago a Cuenta - Régimen General (29.5% tasa única)
    await conContextoEmpresa(empresaRgId, userId, async () => {
      const djRg = await djRentaAnualService.calcularDjAnual(empresaRgId, 2026, {
        regimen: 'REGIMEN_GENERAL',
        utilidadContableOverride: 100000.00,
        reemplazarAdicionesBase: true,
        adicionesManuales: [],
        reemplazarDeduccionesBase: true,
        deduccionesManuales: [],
        pagosACuentaMensualesOverride: 9500.00,
        saldoAFavorAnterior: 500.00,
      });

      assert.strictEqual(djRg.rentaNetaImponible, 100000.00, 'Renta neta imponible RG debe ser S/ 100,000.00');
      assert.strictEqual(djRg.tramosCalculo.length, 1, 'Régimen General tiene un único tramo del 29.5%');
      assert.strictEqual(djRg.tramosCalculo[0].tasaPorcentaje, 29.5, 'Tasa Régimen General debe ser 29.5%');
      assert.strictEqual(djRg.impuestoRentaCalculado, 29500.00, 'Total Impuesto Renta RG (29.5% de S/ 100,000) debe ser S/ 29,500.00');
      assert.strictEqual(djRg.saldoPorRegularizar, 19500.00, 'Saldo por regularizar RG (29,500 - 9,500 - 500) debe ser S/ 19,500.00');

      const resDjPg = await db.query(
        `SELECT regimen, impuesto_renta_calculado::numeric as total_ir
         FROM declaraciones_renta_anual
         WHERE empresa_id = $1 AND anio = 2026`,
        [empresaRgId]
      );
      assert.strictEqual(resDjPg.rows.length, 1, 'Declaración Renta Anual RG debe estar persistida en PostgreSQL');
      assert.strictEqual(Number(resDjPg.rows[0].total_ir), 29500.00, 'Monto persistido en PostgreSQL para DJ RG debe ser S/ 29,500.00');
    });

    console.log('  ✅ [OK] Tributación Mensual y Anual: PDT 621 (IGV, arrastre saldo a favor, Renta MYPE 1%/1.5%) y Renta Anual (MYPE 10%/29.5% y RG 29.5%) en PostgreSQL.');

    // =========================================================================
    // BLOQUE 4: SISTEMAS SUNAT (SPOT, RETENCIONES 3%, PERCEPCIONES, SIRE, PLE)
    // =========================================================================
    console.log('\n[BLOQUE 4] Verificando Sistemas SUNAT (Detracciones SPOT, SIRE RVIE/RCE con CAR, PLE 5.1, 5.2, 6.1, 8.1, 8.2, 14.1) en PostgreSQL...');

    await conContextoEmpresa(empresaMypeId, userId, async () => {
      // 4.1 Detracciones SPOT (R.S. N° 183-2004/SUNAT)
      const spotServicio = detraccionService.calcularDetraccion(2360.00, '022'); // Otros servicios empresariales 12% (> S/ 700)
      assert.strictEqual(spotServicio.aplica, true, 'Operación de S/ 2,360 con código 022 supera umbral de S/ 700');
      assert.strictEqual(spotServicio.porcentaje, 12, 'Código SPOT 022 aplica 12%');
      assert.strictEqual(spotServicio.montoDetraccion, 283.20, 'Detracción 12% de S/ 2,360.00 debe ser S/ 283.20');

      const spotTransporte = detraccionService.calcularDetraccion(1000.00, '027'); // Transporte de carga 4% (> S/ 400)
      assert.strictEqual(spotTransporte.aplica, true, 'Transporte de bienes > S/ 400 aplica SPOT');
      assert.strictEqual(spotTransporte.porcentaje, 4, 'Código SPOT 027 aplica 4%');
      assert.strictEqual(spotTransporte.montoDetraccion, 40.00, 'Detracción 4% de S/ 1,000.00 debe ser S/ 40.00');

      const spotMenorUmbral = detraccionService.calcularDetraccion(500.00, '022');
      assert.strictEqual(spotMenorUmbral.aplica, false, 'Operación de S/ 500 <= S/ 700 no aplica SPOT');

      // Registrar detracción en PostgreSQL vinculada a comprobante de compra
      const compraSpotId = randomUUID();
      await db.query(
        `INSERT INTO comprobantes_compra (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, proveedor_id, moneda, tipo_cambio,
           base_gravada, igv, total, tipo_adquisicion, forma_pago, tiene_detraccion, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-09-18', '2026-09-18', '2026-09-18', '01', 'F005', '00000777', $4, 'PEN', 1.0000, 2000.00, 360.00, 2360.00, '1', 'CREDITO', true, 'REGISTRADO', 'MANUAL', $5)`,
        [compraSpotId, empresaMypeId, periodoSepMypeId, proveedorDomId, userId]
      );

      const detReg = await detraccionService.registrarDetraccion(
        empresaMypeId,
        {
          comprobanteCompraId: compraSpotId,
          codigoBien: '022',
          montoTotalOperacion: 2360.00,
          cuentaBancoNacion: '00-068-123456',
        },
        userId
      );
      assert.strictEqual(detReg.estado, 'PENDIENTE', 'Detracción recién registrada debe estar PENDIENTE');
      assert.strictEqual(detReg.permiteCreditoFiscal, false, 'Detracción PENDIENTE bloquea uso inmediato del crédito fiscal');

      const valAntesDeposito = await detraccionService.validarDerechoCreditoFiscal(empresaMypeId, compraSpotId, '2026-09');
      assert.strictEqual(valAntesDeposito.deducible, false, 'Sin constancia de depósito SPOT no es deducible el crédito fiscal');

      // Registrar constancia de depósito en Banco de la Nación
      await detraccionService.registrarDeposito(detReg.id, '987654321', '2026-09-25', userId, empresaMypeId);
      const detEnPg = await detraccionService.obtenerPorId(empresaMypeId, detReg.id);
      assert.strictEqual(detEnPg?.estado, 'DEPOSITADA', 'Detracción en PostgreSQL debe actualizarse a DEPOSITADA');
      assert.strictEqual(detEnPg?.numeroConstancia, '987654321', 'Número de constancia SPOT debe persistirse en PostgreSQL');

      const valDespuesDeposito = await detraccionService.validarDerechoCreditoFiscal(empresaMypeId, compraSpotId, '2026-09');
      assert.strictEqual(valDespuesDeposito.deducible, true, 'Con depósito SPOT en el período el crédito fiscal queda habilitado');

      // 4.2 SIRE RVIE y RCE con CAR oficial de 27 caracteres
      const carVenta = generarCarOficial(rucMype, '01', 'F001', '5001');
      assert.strictEqual(carVenta.length, 27, 'CAR oficial SUNAT debe tener exactamente 27 caracteres');
      assert.strictEqual(carVenta, `${rucMype}01F0010000005001`, 'Estructura CAR: RUC(11)+Tipo(2)+Serie(4)+Numero(10)');

      const rvieReemplazo = sireLayoutService.generarReemplazoRvie(rucMype, '2026-09', [
        {
          razonSocialEmisor: 'CORPORACION MYPE NORMATIVA 2026 S.A.C.',
          tipoComprobante: '01',
          serie: 'F001',
          numero: '00005001',
          fechaEmision: '2026-09-15',
          fechaVencimiento: '2026-09-15',
          clienteRuc: '20500040301',
          clienteNombre: 'CLIENTE CORPORATIVO PERU S.A.C.',
          baseGravada: 10000.00,
          igv: 1800.00,
          total: 11800.00,
          moneda: 'PEN',
          tipoCambio: 1.0,
        },
      ]);
      assert.strictEqual(rvieReemplazo.nombreArchivoTxt, `LE${rucMype}20260900140400001111.txt`, 'Nomenclatura oficial SIRE RVIE Reemplazo');
      assert.strictEqual(rvieReemplazo.totalCampos, 34, 'RVIE Reemplazo Anexo 2/3 tiene 34 campos oficiales');
      assert.ok(rvieReemplazo.contenidoTxt.includes(carVenta), 'Layout RVIE debe incluir el CAR oficial de 27 dígitos');
      const valRvieReemplazo = archivoValidadorService.validarArchivoTxt(rvieReemplazo.contenidoTxt, 'SIRE_RVIE_REEMPLAZO', rvieReemplazo.nombreArchivoTxt);
      assert.strictEqual(valRvieReemplazo.esValido, true, 'Validador TXT debe aprobar estructura SIRE RVIE Reemplazo');

      const rvieAjuste = sireLayoutService.generarAjustesRvie(
        rucMype,
        '2026-09',
        '2026-08',
        [
          {
            carOriginal: generarCarOficial(rucMype, '01', 'F001', '4001'),
            car: generarCarOficial(rucMype, '07', 'FC01', '15'),
            razonSocialEmpresa: 'CORPORACION MYPE NORMATIVA 2026 S.A.C.',
            tipoComprobante: '07',
            serie: 'FC01',
            numero: '00000015',
            fechaEmision: '2026-09-25',
            clienteRuc: '20500040301',
            clienteNombre: 'CLIENTE CORPORATIVO PERU S.A.C.',
            baseGravada: -1000.00,
            igv: -180.00,
            total: -1180.00,
            moneda: 'PEN',
            tipoCambio: 1.0,
            fechaDocModificado: '2026-08-15',
            tipoDocModificado: '01',
            serieDocModificado: 'F001',
            numeroDocModificado: '00004001',
          },
        ]
      );
      assert.strictEqual(rvieAjuste.nombreArchivoTxt, `LE${rucMype}20260900140500001111.txt`, 'Nomenclatura oficial SIRE RVIE Ajustes Posteriores');
      assert.strictEqual(rvieAjuste.totalCampos, 35, 'RVIE Ajustes Posteriores Anexo 4/5 tiene 35 campos oficiales con CAR');
      const valRvieAjuste = archivoValidadorService.validarArchivoTxt(rvieAjuste.contenidoTxt, 'SIRE_RVIE_AJUSTE', rvieAjuste.nombreArchivoTxt);
      assert.strictEqual(valRvieAjuste.esValido, true, 'Validador TXT debe aprobar estructura SIRE RVIE Ajustes (35 campos)');

      const rceReemplazo = sireLayoutService.generarReemplazoRce(rucMype, '2026-09', [
        {
          razonSocialUsuario: 'CORPORACION MYPE NORMATIVA 2026 S.A.C.',
          tipoComprobante: '01',
          serie: 'F001',
          numero: '00009001',
          fechaEmision: '2026-09-08',
          fechaVencimiento: '2026-09-08',
          proveedorRuc: '20100070970',
          proveedorNombre: 'PROVEEDOR NACIONAL S.A.C.',
          baseGravada: 20000.00,
          igv: 3600.00,
          total: 23600.00,
          moneda: 'PEN',
          tipoCambio: 1.0,
        },
      ]);
      assert.strictEqual(rceReemplazo.nombreArchivoTxt, `LE${rucMype}20260900080400001111.txt`, 'Nomenclatura oficial SIRE RCE Reemplazo');
      assert.strictEqual(rceReemplazo.totalCampos, 42, 'RCE Reemplazo Anexo 8 tiene 42 campos oficiales con CAR');
      const valRceReemplazo = archivoValidadorService.validarArchivoTxt(rceReemplazo.contenidoTxt, 'SIRE_RCE_REEMPLAZO', rceReemplazo.nombreArchivoTxt);
      assert.strictEqual(valRceReemplazo.esValido, true, 'Validador TXT debe aprobar estructura SIRE RCE Reemplazo (42 campos)');

      // Conciliación SIRE en PostgreSQL real
      const propuestaTxt = sireLayoutService.generarPropuestaSireTxt([
        {
          car: generarCarOficial('20100070970', '01', 'F001', '00009001'),
          tipoComprobante: '01',
          serie: 'F001',
          numero: '00009001',
          fechaEmision: '2026-09-08',
          fechaVencimiento: '2026-09-08',
          rucEmisor: '20100070970',
          razonSocialEmisor: 'PROVEEDOR NACIONAL S.A.C.',
          rucReceptor: rucMype,
          razonSocialReceptor: 'CORPORACION MYPE NORMATIVA 2026 S.A.C.',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: 20000.00,
          igv: 3600.00,
          total: 23600.00,
          tieneDetraccion: false,
          clasificacion: 'MERCADERIA',
        },
      ]);
      await sireService.importarPropuestaManual(
        empresaMypeId,
        'COMPRAS',
        '2026-09',
        Buffer.from(propuestaTxt, 'utf8'),
        'PROPUESTA_RCE_202609.txt',
        userId
      );

      // Asegurar que la compra también esté en COMPRAS_MEMORIA para el cruce híbrido y exportación
      COMPRAS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-08',
        fechaVencimiento: '2026-09-08',
        fechaContable: '2026-09-08',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '00009001',
        proveedorId: proveedorDomId,
        proveedorRuc: '20100070970',
        proveedorNombre: 'PROVEEDOR NACIONAL S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.0,
        baseGravada: 20000.00,
        igv: 3600.00,
        baseNoGravada: 0,
        exonerado: 0,
        isc: 0,
        icbper: 0,
        otrosTributos: 0,
        total: 23600.00,
        tipoAdquisicion: '1',
        formaPago: 'CONTADO',
        diasCredito: 0,
        tieneDetraccion: false,
        tieneRetencion: false,
        estado: 'REGISTRADO',
        origen: 'MANUAL',
      } as any);

      // Agregar compra No Domiciliado (Tipo '00' Formato 8.2) en PostgreSQL y memoria para exportar PLE 8.2
      const compraNoDomId = randomUUID();
      await db.query(
        `INSERT INTO comprobantes_compra (
           id, empresa_id, periodo_id, fecha_emision, fecha_vencimiento, fecha_contable,
           tipo_comprobante, serie, numero, proveedor_id, moneda, tipo_cambio,
           base_gravada, igv, base_no_gravada, total, tipo_adquisicion, forma_pago, estado, origen, created_by
         ) VALUES ($1, $2, $3, '2026-09-14', '2026-09-14', '2026-09-14', '00', 'INV1', '00008888', $4, 'USD', 3.7500, 0.00, 0.00, 5000.00, 5000.00, '4', 'CONTADO', 'REGISTRADO', 'MANUAL', $5)`,
        [compraNoDomId, empresaMypeId, periodoSepMypeId, proveedorNoDomId, userId]
      );

      COMPRAS_MEMORIA.push({
        id: compraNoDomId,
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-14',
        fechaVencimiento: '2026-09-14',
        fechaContable: '2026-09-14',
        tipoComprobante: '00',
        serie: 'INV1',
        numero: '00008888',
        proveedorId: proveedorNoDomId,
        proveedorRuc: '999888777',
        proveedorNombre: 'CLOUD SERVICES INC',
        moneda: 'USD',
        tipoCambio: 3.75,
        baseGravada: 0,
        igv: 0,
        baseNoGravada: 5000.00,
        total: 5000.00,
        estado: 'REGISTRADO',
      } as any);

      VENTAS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-15',
        fechaVencimiento: '2026-09-15',
        fechaContable: '2026-09-15',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '00005001',
        clienteId,
        clienteRuc: '20500040301',
        clienteNombre: 'CLIENTE CORPORATIVO PERU S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.0,
        baseGravada: 10000.00,
        igv: 1800.00,
        total: 11800.00,
        estado: 'REGISTRADO',
      } as any);

      // Asegurar al menos 2 líneas en ASIENTOS_MEMORIA con `per-2026-09` para verificar CRLF (`\r\n`) en Diario 5.1, 5.2 y Mayor 6.1
      ASIENTOS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        subdiarioId: '02',
        numero: '02-000001',
        cuo: 'M000001',
        fecha: '2026-09-15',
        glosa: 'Venta de mercaderias segun factura F001-00005001',
        moneda: 'PEN',
        tipoCambio: 1.0,
        estado: 'CONTABILIZADO',
        detalles: [
          { cuentaId: '12121', cuentaCodigo: '12121', glosaLinea: 'Factura por cobrar', debe: 11800.00, haber: 0 },
          { cuentaId: '40111', cuentaCodigo: '40111', glosaLinea: 'IGV Debito Fiscal', debe: 0, haber: 1800.00 },
          { cuentaId: '70111', cuentaCodigo: '70111', glosaLinea: 'Ventas gravadas', debe: 0, haber: 10000.00 },
        ],
      } as any);

      const concSire = await conciliadorSireService.conciliarPeriodo(empresaMypeId, 'COMPRAS', '2026-09');
      assert.ok(concSire.totalCoinciden >= 1, 'Conciliador SIRE debe detectar coincidencia exacta en RCE');

      // 4.3 Libros Electrónicos PLE 5.2 (5.1 Diario, 5.2 Diario Simplificado, 6.1 Mayor, 8.1 Compras, 8.2 No Domiciliados, 14.1 Ventas)
      const librosPleRequeridos: Array<{ codigo: string; nombre: string; camposEsperados: number }> = [
        { codigo: '050100', nombre: '5.1 Libro Diario', camposEsperados: 21 },
        { codigo: '050200', nombre: '5.2 Libro Diario Simplificado', camposEsperados: 21 },
        { codigo: '060100', nombre: '6.1 Libro Mayor', camposEsperados: 16 },
        { codigo: '080100', nombre: '8.1 Registro de Compras', camposEsperados: 42 },
        { codigo: '080200', nombre: '8.2 Registro de Compras No Domiciliados', camposEsperados: 36 },
        { codigo: '140100', nombre: '14.1 Registro de Ventas e Ingresos', camposEsperados: 35 },
      ];

      // Agregar segunda compra y venta para que todos los libros tengan >= 2 filas y CRLF (\r\n) explícito
      COMPRAS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-19',
        fechaVencimiento: '2026-09-19',
        fechaContable: '2026-09-19',
        tipoComprobante: '01',
        serie: 'F005',
        numero: '00000777',
        proveedorId: proveedorDomId,
        proveedorRuc: '20100070970',
        proveedorNombre: 'PROVEEDOR NACIONAL S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.0,
        baseGravada: 2000.00,
        igv: 360.00,
        total: 2360.00,
        estado: 'REGISTRADO',
      } as any);

      COMPRAS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-22',
        fechaVencimiento: '2026-09-22',
        fechaContable: '2026-09-22',
        tipoComprobante: '00',
        serie: 'INV2',
        numero: '00008889',
        proveedorId: proveedorNoDomId,
        proveedorRuc: '999888777',
        proveedorNombre: 'CLOUD SERVICES INC',
        moneda: 'USD',
        tipoCambio: 3.76,
        baseGravada: 0,
        igv: 0,
        baseNoGravada: 3000.00,
        total: 3000.00,
        estado: 'REGISTRADO',
      } as any);

      VENTAS_MEMORIA.push({
        id: randomUUID(),
        empresaId: empresaMypeId,
        periodoId: `per-2026-09`,
        fechaEmision: '2026-09-25',
        fechaVencimiento: '2026-09-25',
        fechaContable: '2026-09-25',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '00005002',
        clienteId,
        clienteRuc: '20500040301',
        clienteNombre: 'CLIENTE CORPORATIVO PERU S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.0,
        baseGravada: 5000.00,
        igv: 900.00,
        total: 5900.00,
        estado: 'REGISTRADO',
      } as any);

      for (const lib of librosPleRequeridos) {
        const exp = await pleExportService.exportarLibro(empresaMypeId, '2026-09', lib.codigo, rucMype, userId);
        const nombreEsperado = `LE${rucMype}20260900${lib.codigo}001111.txt`;
        assert.strictEqual(
          exp.nombreArchivo,
          nombreEsperado,
          `Libro PLE ${lib.nombre} debe tener nomenclatura exacta ${nombreEsperado} (recibido: ${exp.nombreArchivo})`
        );
        assert.ok(exp.totalFilas >= 2, `Libro PLE ${lib.nombre} debe contener al menos 2 filas de datos`);
        assert.ok(exp.contenidoTxt.includes('\r\n'), `Libro PLE ${lib.nombre} debe usar salto de línea oficial CRLF (\\r\\n)`);

        const valPle = archivoValidadorService.validarArchivoTxt(exp.contenidoTxt, lib.codigo, exp.nombreArchivo);
        assert.strictEqual(
          valPle.esValido,
          true,
          `Libro PLE ${lib.nombre} debe superar el validador estructural de ${lib.camposEsperados} campos sin errores`
        );
      }

      const resPlePg = await db.query(
        `SELECT codigo_libro, nombre_archivo, total_filas, hash_sha256
         FROM ple_exportaciones
         WHERE empresa_id = $1 AND periodo = '2026-09'
         ORDER BY codigo_libro ASC`,
        [empresaMypeId]
      );
      assert.strictEqual(
        resPlePg.rows.length,
        6,
        'Las 6 exportaciones oficiales PLE (5.1, 5.2, 6.1, 8.1, 8.2, 14.1) deben estar persistidas en PostgreSQL real'
      );
    });

    console.log('  ✅ [OK] Sistemas SUNAT: SPOT (cálculo, bloqueo crédito fiscal y depósito BN), Retenciones 3%, Percepciones, SIRE RVIE/RCE con CAR y PLE (5.1, 5.2, 6.1, 8.1, 8.2, 14.1) con CRLF en PostgreSQL.');

    console.log('\n======================================================================');
    console.log(' ✅ FASE E SUPERADA AL 100%: TODAS LAS PRUEBAS NORMATIVAS 2026 APROBADAS');
    console.log('======================================================================');
  } finally {
    // Limpieza ordenada de datos de prueba en PostgreSQL real (sin tocar auditoria ni auditoria_log que son append-only)
    const cleanClient = await pool.connect();
    try {
      for (const empId of [empresaMypeId, empresaRgId]) {
        await cleanClient.query(
          `SELECT set_config('app.empresa_id', $1, false),
                  set_config('app.current_empresa_id', $1, false),
                  set_config('app.usuario_id', $2, false),
                  set_config('app.current_user_id', $2, false),
                  set_config('app.restaurando_backup', 'true', false)`,
          [empId, userId]
        );
        await cleanClient.query(`DELETE FROM ple_exportaciones WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM sire_conciliaciones WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM sire_propuestas WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM declaraciones_renta_anual WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM declaraciones_pdt621 WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM retenciones_percepciones_igv WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM detracciones WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM recibos_honorarios WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM cuentas_por_pagar WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM cuentas_por_cobrar WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM comprobantes_compra WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM comprobantes_venta WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM asiento_detalle WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM asientos WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM anexos WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM plan_cuentas WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM subdiarios WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM periodos WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM ejercicios WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM membresias WHERE empresa_id = $1`, [empId]);
        await cleanClient.query(`DELETE FROM empresas WHERE id = $1`, [empId]);
      }
      await cleanClient.query(`DELETE FROM usuarios_estudio WHERE id = $1`, [userId]);
      await cleanClient.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    } catch (cleanErr) {
      console.warn('Aviso en limpieza de datos de prueba:', cleanErr);
    } finally {
      cleanClient.release();
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ [FALLO EN TEST FASE E NORMATIVA 2026]:', err);
  process.exit(1);
});
