import assert from 'assert';
import { COMPRAS_MEMORIA } from '../services/compraService';
import { VENTAS_MEMORIA } from '../services/ventaService';
import { ASIENTOS_MEMORIA } from '../services/asientoService';
import {
  liquidacionIGVService,
  DECLARACIONES_PDT621_MEMORIA,
} from '../services/liquidacionIGVService';
import {
  prorrataIgvService,
  DECLARACIONES_PRORRATA_MEMORIA,
} from '../services/prorrataIgvService';
import { djRentaAnualService } from '../services/djRentaAnualService';
import { daotService, DAOT_EXCLUSIONES_MEMORIA } from '../services/daotService';
import {
  cronogramaVencimientosService,
  CRONOGRAMA_VENCIMIENTOS_MEMORIA,
} from '../services/cronogramaVencimientosService';
import {
  parametroRepository,
  HISTORIAL_PARAMETROS_MEMORIA,
} from '../repositories/parametroRepository';

async function runTestsFase4Tributos() {
  console.log('\n====================================================================');
  console.log('🧪 INICIANDO PRUEBAS AUTOMATIZADAS — FASE 4: MÓDULO TRIBUTOS (A-H)');
  console.log('====================================================================\n');

  const empresaId = 'emp-tributos-f4-01';

  const limpiarEstadoEmpresa = () => {
    for (let i = COMPRAS_MEMORIA.length - 1; i >= 0; i--) {
      if (COMPRAS_MEMORIA[i].empresaId === empresaId) COMPRAS_MEMORIA.splice(i, 1);
    }
    for (let i = VENTAS_MEMORIA.length - 1; i >= 0; i--) {
      if (VENTAS_MEMORIA[i].empresaId === empresaId) VENTAS_MEMORIA.splice(i, 1);
    }
    for (let i = DECLARACIONES_PDT621_MEMORIA.length - 1; i >= 0; i--) {
      if (DECLARACIONES_PDT621_MEMORIA[i].empresaId === empresaId) {
        DECLARACIONES_PDT621_MEMORIA.splice(i, 1);
      }
    }
    for (let i = DECLARACIONES_PRORRATA_MEMORIA.length - 1; i >= 0; i--) {
      if (DECLARACIONES_PRORRATA_MEMORIA[i].empresaId === empresaId) {
        DECLARACIONES_PRORRATA_MEMORIA.splice(i, 1);
      }
    }
    for (let i = DAOT_EXCLUSIONES_MEMORIA.length - 1; i >= 0; i--) {
      if (DAOT_EXCLUSIONES_MEMORIA[i].empresaId === empresaId) {
        DAOT_EXCLUSIONES_MEMORIA.splice(i, 1);
      }
    }
  };

  limpiarEstadoEmpresa();

  // -------------------------------------------------------------------------
  // CASO (a): Mes con saldo a favor que arrastra al mes siguiente
  // -------------------------------------------------------------------------
  console.log('▶ Caso (a): Mes 2026-08 con saldo a favor que arrastra automáticamente a 2026-09...');
  // En 2026-08: Ventas Gravadas S/ 20,000 (IGV S/ 3,600) y Compras Gravadas S/ 30,000 (IGV S/ 5,400)
  // Resultado 2026-08: Nuevo Saldo a Favor = 5,400 - 3,600 = S/ 1,800.00
  VENTAS_MEMORIA.push({
    id: 'v-f4-a1',
    empresaId,
    periodoId: '2026-08',
    clienteId: 'cli-a1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00001001',
    fechaEmision: '2026-08-10',
    fechaContable: '2026-08-10',
    moneda: 'PEN',
    tipoCambio: 1,
    baseGravada: 20000,
    igv: 3600,
    total: 23600,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-v-a1',
  } as any);
  COMPRAS_MEMORIA.push({
    id: 'c-f4-a1',
    empresaId,
    periodoId: '2026-08',
    proveedorId: 'prv-a1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00002001',
    fechaEmision: '2026-08-12',
    fechaContable: '2026-08-12',
    moneda: 'PEN',
    tipoCambio: 1,
    tipoAdquisicion: '1',
    baseGravada: 30000,
    igv: 5400,
    total: 35400,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-c-a1',
  } as any);

  const liqAgosto = await liquidacionIGVService.calcular(empresaId, '2026-08', {
    regimenOverride: 'MYPE_TRIBUTARIO',
    saldoAnteriorAFavor: 0,
  });
  assert.strictEqual(liqAgosto.debitoFiscalIgv, 3600);
  assert.strictEqual(liqAgosto.creditoFiscalIgv, 5400);
  assert.strictEqual(liqAgosto.igvPorPagar, 0);
  assert.strictEqual(liqAgosto.nuevoSaldoAFavor, 1800);

  // En 2026-09: Ventas Gravadas S/ 40,000 (IGV S/ 7,200) y Compras Gravadas S/ 20,000 (IGV S/ 3,600)
  // Sin pasar saldoAnteriorAFavor explícito (undefined), debe arrastrar S/ 1,800.00 de 2026-08:
  // IGV neto = 7,200 - 3,600 - 1,800 = S/ 1,800.00
  VENTAS_MEMORIA.push({
    id: 'v-f4-a2',
    empresaId,
    periodoId: '2026-09',
    clienteId: 'cli-a1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00001002',
    fechaEmision: '2026-09-10',
    fechaContable: '2026-09-10',
    moneda: 'PEN',
    tipoCambio: 1,
    baseGravada: 40000,
    igv: 7200,
    total: 47200,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-v-a2',
  } as any);
  COMPRAS_MEMORIA.push({
    id: 'c-f4-a2',
    empresaId,
    periodoId: '2026-09',
    proveedorId: 'prv-a1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00002002',
    fechaEmision: '2026-09-12',
    fechaContable: '2026-09-12',
    moneda: 'PEN',
    tipoCambio: 1,
    tipoAdquisicion: '1',
    baseGravada: 20000,
    igv: 3600,
    total: 23600,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-c-a2',
  } as any);

  const liqSeptiembre = await liquidacionIGVService.calcular(empresaId, '2026-09', {
    regimenOverride: 'MYPE_TRIBUTARIO',
  });
  assert.strictEqual(liqSeptiembre.saldoAnteriorAFavor, 1800, 'Debe arrastrar S/ 1,800.00 de 2026-08');
  assert.strictEqual(liqSeptiembre.igvDeterminado, 3600, 'Casilla 140 = 7200 - 3600 = 3600');
  assert.strictEqual(liqSeptiembre.igvPorPagar, 1800, 'Casilla 188 = 3600 - 1800 = 1800');
  console.log(
    `  ✓ Caso (a) OK: 2026-08 generó Saldo a Favor S/ ${liqAgosto.nuevoSaldoAFavor.toFixed(2)} -> arrastrado a 2026-09 [Cas. 145 = S/ ${liqSeptiembre.saldoAnteriorAFavor.toFixed(2)}], reduciendo IGV por pagar de S/ 3,600.00 a S/ ${liqSeptiembre.igvPorPagar.toFixed(2)}.`
  );

  // -------------------------------------------------------------------------
  // CASO (b): Mes con retenciones y percepciones del IGV
  // -------------------------------------------------------------------------
  console.log('▶ Caso (b): Mes 2026-09 con retenciones (S/ 450.00) y percepciones (S/ 250.00) del IGV...');
  const liqConRetPer = await liquidacionIGVService.calcular(empresaId, '2026-09', {
    regimenOverride: 'MYPE_TRIBUTARIO',
    saldoAnteriorAFavor: 1800,
    retencionesPeriodo: 450,
    percepcionesPeriodo: 250,
    saldoFavorRentaAnterior: 120,
  });
  assert.strictEqual(liqConRetPer.casillas.c184_tributoAPagarOSaldoFavor, 1800);
  assert.strictEqual(liqConRetPer.casillas.c171_percepcionesPeriodo, 250, 'Casilla 171 = Percepciones del período (250.00)');
  assert.strictEqual(liqConRetPer.casillas.c179_retencionesPeriodo, 450, 'Casilla 179 = Retenciones del período (450.00)');
  assert.strictEqual(liqConRetPer.casillas.c188_totalDeudaTributariaIgv, 1100, 'Casilla 188 = 1800 - 250 - 450 = 1100');
  assert.strictEqual(liqConRetPer.casillas.c303_saldoFavorRentaCompensado, 120, 'Casilla 303 = Saldo a favor Renta anterior compensado (120.00)');
  assert.strictEqual(liqConRetPer.casillas.c304_pagoACuentaRentaPorPagar, 280, 'Casilla 304 = 400 - 120 = 280.00');
  assert.strictEqual(liqConRetPer.retencionesAplicables, 450);
  assert.strictEqual(liqConRetPer.percepcionesAplicables, 250);
  assert.strictEqual(liqConRetPer.igvPorPagar, 1100, 'Casilla 188 = 1800 - 250 - 450 = 1100');
  console.log(
    `  ✓ Caso (b) OK: Cas. 184 (S/ ${liqConRetPer.casillas.c184_tributoAPagarOSaldoFavor.toFixed(2)}) - Percepciones Cas. 171 (S/ ${liqConRetPer.casillas.c171_percepcionesPeriodo.toFixed(2)}) - Retenciones Cas. 179 (S/ ${liqConRetPer.casillas.c179_retencionesPeriodo.toFixed(2)}) = IGV por pagar Cas. 188 S/ ${liqConRetPer.casillas.c188_totalDeudaTributariaIgv.toFixed(2)} | Renta Cas. 303 S/ ${liqConRetPer.casillas.c303_saldoFavorRentaCompensado.toFixed(2)}.`
  );

  // Verificación explícita de Casilla 102 (Descuentos y devoluciones por Nota de Crédito '07')
  VENTAS_MEMORIA.push({
    id: 'v-f4-nc07',
    empresaId,
    periodoId: '2026-09',
    clienteId: 'cli-a2',
    tipoComprobante: '07',
    serie: 'FC01',
    numero: '00000010',
    fechaEmision: '2026-09-25',
    fechaContable: '2026-09-25',
    moneda: 'PEN',
    tipoCambio: 1,
    baseGravada: 1000,
    igv: 180,
    total: 1180,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-v-nc07',
  } as any);
  const liqConNc = await liquidacionIGVService.calcular(empresaId, '2026-09', {
    regimenOverride: 'MYPE_TRIBUTARIO',
    saldoAnteriorAFavor: 1800,
    retencionesPeriodo: 450,
    percepcionesPeriodo: 250,
  });
  assert.strictEqual(liqConNc.casillas.c102_descuentosDevolucionesBase, 1000, 'Casilla 102 = Base Notas de Crédito ventas (1000.00)');
  assert.strictEqual(liqConNc.casillas.c103_descuentosDevolucionesIgv, 180, 'Casilla 103 = IGV Notas de Crédito ventas (180.00)');
  assert.strictEqual(liqConNc.casillas.c188_totalDeudaTributariaIgv, 920, 'Casilla 188 tras NC = 1100 - 180 = 920.00');

  // -------------------------------------------------------------------------
  // CASO (c): MYPE Tributario (1%) vs Régimen General con coeficiente
  // -------------------------------------------------------------------------
  console.log('▶ Caso (c): MYPE Tributario (1.0%) vs Régimen General con coeficiente (2.40% > 1.50%)...');
  limpiarEstadoEmpresa();
  VENTAS_MEMORIA.push({
    id: 'v-f4-c1',
    empresaId,
    periodoId: '2026-10',
    clienteId: 'cli-c1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00003001',
    fechaEmision: '2026-10-15',
    fechaContable: '2026-10-15',
    moneda: 'PEN',
    tipoCambio: 1,
    baseGravada: 50000,
    igv: 9000,
    total: 59000,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-v-c1',
  } as any);

  const liqMype = await liquidacionIGVService.calcular(empresaId, '2026-10', {
    regimenOverride: 'MYPE_TRIBUTARIO',
    saldoAnteriorAFavor: 0,
  });
  const liqGeneralCoef = await liquidacionIGVService.calcular(empresaId, '2026-10', {
    regimenOverride: 'REGIMEN_GENERAL',
    saldoAnteriorAFavor: 0,
    coeficienteRentaOverride: 0.024,
  });

  assert.strictEqual(liqMype.tasaRentaAplicada, 0.01, 'MYPE Tributario <= 300 UIT aplica 1.0% (0.01)');
  assert.strictEqual(liqMype.pagoCuentaRenta, 500, '50,000 * 1.0% = 500');
  assert.strictEqual(liqGeneralCoef.tasaRentaAplicada, 0.024, 'Régimen General aplica máx(1.5%, 2.4%) = 2.4% (0.024)');
  assert.strictEqual(liqGeneralCoef.pagoCuentaRenta, 1200, '50,000 * 2.4% = 1,200');

  // Verificar edición de parámetros restringida a ADMINISTRADOR con auditoría
  await assert.rejects(
    async () => {
      await parametroRepository.guardarOActualizarParametro(
        {
          codigoParametro: 'TASA_RENTA_MYPE_SUB300',
          descripcion: 'Intento no autorizado',
          valorNumerico: 0.012,
          vigenteDesde: '2026-01-01',
          vigenteHasta: null,
          categoria: 'RENTA',
        },
        'u-cont',
        'CONTADOR'
      );
    },
    (err: any) => err.message.includes('PERMISO_DENEGADO'),
    'CONTADOR no debe poder modificar parámetros tributarios'
  );

  const histAntes = HISTORIAL_PARAMETROS_MEMORIA.length;
  await parametroRepository.guardarOActualizarParametro(
    {
      codigoParametro: 'VALOR_UIT_2026',
      descripcion: 'Valor oficial UIT 2026 (D.S. N° 301-2025-EF)',
      valorNumerico: 5500,
      vigenteDesde: '2026-01-01',
      vigenteHasta: '2026-12-31',
      categoria: 'UIT',
      motivo: 'Confirmación normativa D.S. 301-2025-EF',
    },
    'u-admin',
    'ADMIN_ESTUDIO'
  );
  assert.strictEqual(HISTORIAL_PARAMETROS_MEMORIA.length, histAntes + 1, 'Debe registrar auditoría del parámetro');

  // También verificar Renta Anual RMT vs General con UIT 2026 = S/ 5,500
  const djAnualRmt = await djRentaAnualService.calcularDjAnual(empresaId, 2026, {
    regimen: 'MYPE_TRIBUTARIO',
    utilidadContableOverride: 100000,
    adicionesManuales: [{ id: 'a1', codigo: 'AD-1', descripcion: 'Adición', baseLegal: 'Art. 44', monto: 10000 }],
    reemplazarAdicionesBase: true,
    deduccionesManuales: [{ id: 'd1', codigo: 'DD-1', descripcion: 'Deducción', baseLegal: 'Art. 37', monto: 5000 }],
    reemplazarDeduccionesBase: true,
    sistemaCompensacionPerdidas: 'SISTEMA_A',
    perdidaArrastrableDeclarada: 5000,
    pagosACuentaMensualesOverride: 6000,
  });
  // Renta Neta Imponible = 100,000 + 10,000 - 5,000 - 5,000 = 100,000
  // 15 UIT (2026) = 82,500 -> Tramo 1 (10%) = 8,250; Exceso = 17,500 * 29.5% = 5,162.50 -> Total Impuesto = 13,412.50
  assert.strictEqual(djAnualRmt.uitAplicable, 5500);
  assert.strictEqual(djAnualRmt.rentaNetaImponible, 100000);
  assert.strictEqual(djAnualRmt.tramosCalculo[0].impuestoTramo, 8250);
  assert.strictEqual(djAnualRmt.tramosCalculo[1].impuestoTramo, 5162.5);
  assert.strictEqual(djAnualRmt.impuestoRentaCalculado, 13412.5);
  console.log(
    `  ✓ Caso (c) OK: Base S/ 50,000.00 -> MYPE (1.0% = S/ ${liqMype.pagoCuentaRenta.toFixed(2)}) vs RG con Coef. 0.0240 (2.40% = S/ ${liqGeneralCoef.pagoCuentaRenta.toFixed(2)}). DJ Anual RMT (15 UIT = S/ 82,500): Impuesto S/ ${djAnualRmt.impuestoRentaCalculado.toFixed(2)}.`
  );

  // -------------------------------------------------------------------------
  // CASO (d): Prorrata con 60% de operaciones gravadas
  // -------------------------------------------------------------------------
  console.log('▶ Caso (d): Prorrata del IGV con 60% de operaciones gravadas...');
  limpiarEstadoEmpresa();
  VENTAS_MEMORIA.push({
    id: 'v-f4-d1',
    empresaId,
    periodoId: '2026-09',
    clienteId: 'cli-d1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00004001',
    fechaEmision: '2026-09-15',
    fechaContable: '2026-09-15',
    moneda: 'PEN',
    tipoCambio: 1,
    baseGravada: 60000,
    igv: 10800,
    baseNoGravada: 40000,
    total: 110800,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-v-d1',
  } as any);
  COMPRAS_MEMORIA.push({
    id: 'c-f4-d1',
    empresaId,
    periodoId: '2026-09',
    proveedorId: 'prv-d1',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00005001',
    fechaEmision: '2026-09-18',
    fechaContable: '2026-09-18',
    moneda: 'PEN',
    tipoCambio: 1,
    tipoAdquisicion: '2', // Uso común (Gravadas y No Gravadas)
    baseGravada: 10000,
    igv: 1800,
    total: 11800,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-c-d1',
  } as any);

  const prorrata60 = await prorrataIgvService.calcularProrrata(empresaId, '2026-09', {
    usarVentana12Meses: false,
    integrarEnPdt621: true,
  });
  assert.strictEqual(prorrata60.coeficienteProrrata, 0.6, 'Coeficiente debe ser 0.6000');
  assert.strictEqual(prorrata60.porcentajeProrrata, 60, 'Porcentaje debe ser 60.00%');
  assert.strictEqual(prorrata60.igvCreditoFiscalPermitido, 1080, '1,800 * 60% = 1,080.00');
  assert.strictEqual(prorrata60.igvGastoCostoNoAdmitido, 720, '1,800 - 1,080 = 720.00 a Cuenta 64111');

  // Verificar que PDT 621 integra automáticamente el 60% en Casilla 111
  const liqConProrrata = await liquidacionIGVService.calcular(empresaId, '2026-09', {
    regimenOverride: 'MYPE_TRIBUTARIO',
    saldoAnteriorAFavor: 0,
    integrarProrrata: true,
  });
  assert.strictEqual(liqConProrrata.casillas.c111_comprasDestinoComunIgvAdmitido, 1080);
  assert.strictEqual(liqConProrrata.igvNoAdmitidoGasto64111, 720);
  console.log(
    `  ✓ Caso (d) OK: Operaciones gravadas 60.00% (Coef. ${prorrata60.coeficienteProrrata.toFixed(4)}) sobre IGV común S/ 1,800.00 -> Crédito Fiscal Admitido [Cas. 111] = S/ ${prorrata60.igvCreditoFiscalPermitido.toFixed(2)}, Costo/Gasto [Cta. 64111] = S/ ${prorrata60.igvGastoCostoNoAdmitido.toFixed(2)}.`
  );

  // -------------------------------------------------------------------------
  // CASO (h) y CASO (e): Preliquidación bloqueada a AUDITOR, permitida a CONTADOR/ADMIN,
  // Presentación manual y Rectificatoria que conserva la versión anterior
  // -------------------------------------------------------------------------
  console.log('▶ Caso (h): Usuario con rol AUDITOR no puede preliquidar (PERMISO_DENEGADO)...');
  await assert.rejects(
    async () => {
      await liquidacionIGVService.preliquidar(empresaId, '2026-09', 'u-auditor', 'AUDITOR');
    },
    (err: any) => err.message.includes('PERMISO_DENEGADO'),
    'Rol AUDITOR debe ser rechazado al intentar preliquidar'
  );
  console.log('  ✓ Caso (h) OK: Rol AUDITOR bloqueado con PERMISO_DENEGADO al intentar preliquidar.');

  console.log('▶ Caso (e): Flujo Preliquidar (genera asiento) -> Presentar -> Rectificatoria conservando versión anterior...');
  const preliquidadaV1 = await liquidacionIGVService.preliquidar(
    empresaId,
    '2026-09',
    'u-admin',
    'ADMIN_ESTUDIO',
    {
      regimenOverride: 'MYPE_TRIBUTARIO',
      saldoAnteriorAFavor: 0,
      integrarProrrata: true,
    }
  );
  assert.strictEqual(preliquidadaV1.version, 1);
  assert.strictEqual(preliquidadaV1.estado, 'PRELIQUIDADO');
  assert.ok(preliquidadaV1.asientoDeterminacionId, 'Debe generar asiento de determinación en Subdiario 06');

  const asientoGen = ASIENTOS_MEMORIA.find((a) => a.id === preliquidadaV1.asientoDeterminacionId);
  assert.ok(asientoGen, 'El asiento de determinación debe existir en ASIENTOS_MEMORIA');
  assert.strictEqual(
    Number(asientoGen!.totalDebe).toFixed(2),
    Number(asientoGen!.totalHaber).toFixed(2),
    'Asiento de determinación debe cuadrar por partida doble'
  );

  const presentadaV1 = await liquidacionIGVService.presentar(
    empresaId,
    '2026-09',
    {
      numeroOrden: '99001122',
      fechaPresentacion: '2026-10-16',
    },
    'u-admin',
    'ADMIN_ESTUDIO'
  );
  assert.strictEqual(presentadaV1.estado, 'PRESENTADO');
  assert.strictEqual(presentadaV1.numeroOrden, '99001122');

  // Agregar una compra adicional en 2026-09 y generar Rectificatoria v2
  COMPRAS_MEMORIA.push({
    id: 'c-f4-e2',
    empresaId,
    periodoId: '2026-09',
    proveedorId: 'prv-e2',
    tipoComprobante: '01',
    serie: 'F001',
    numero: '00005099',
    fechaEmision: '2026-09-25',
    fechaContable: '2026-09-25',
    moneda: 'PEN',
    tipoCambio: 1,
    tipoAdquisicion: '1',
    baseGravada: 5000,
    igv: 900,
    total: 5900,
    estado: 'CONTABILIZADO',
    asientoId: 'asi-c-e2',
  } as any);

  const { rectificatoria: rectificatoriaV2, versionAnteriorConservada } =
    await liquidacionIGVService.rectificar(
      empresaId,
      '2026-09',
      {
        regimenOverride: 'MYPE_TRIBUTARIO',
        saldoAnteriorAFavor: 0,
        integrarProrrata: true,
        motivoRectificatoria: 'Inclusión de factura F001-00005099 omitida en declaración original',
      },
      'u-admin',
      'ADMIN_ESTUDIO'
    );

  const historial = liquidacionIGVService.obtenerHistorial(empresaId, '2026-09');
  assert.strictEqual(historial.length, 2, 'Deben existir 2 versiones en el historial del período');
  assert.strictEqual(versionAnteriorConservada.version, 1);
  assert.strictEqual(versionAnteriorConservada.estado, 'SUSTITUIDA', 'La versión 1 queda conservada como SUSTITUIDA');
  assert.strictEqual(versionAnteriorConservada.numeroOrden, '99001122', 'La versión 1 conserva su número de orden original');
  assert.strictEqual(versionAnteriorConservada.igvPorPagar, 9720, 'La versión 1 conserva su IGV original (10800 - 1080)');
  assert.strictEqual(rectificatoriaV2.version, 2);
  assert.strictEqual(rectificatoriaV2.esRectificatoria, true);
  assert.strictEqual(rectificatoriaV2.igvPorPagar, 8820, 'La versión 2 refleja el nuevo crédito fiscal (9720 - 900 = 8820)');
  console.log(
    `  ✓ Caso (e) OK: Versión 1 conservada [Estado=${versionAnteriorConservada.estado}, N° Orden=${versionAnteriorConservada.numeroOrden}, IGV=S/ ${versionAnteriorConservada.igvPorPagar.toFixed(2)}, Asiento=${asientoGen!.numero}] y Rectificatoria v2 creada [IGV=S/ ${rectificatoriaV2.igvPorPagar.toFixed(2)}].`
  );

  // -------------------------------------------------------------------------
  // CASO (f): DAOT con un tercero justo debajo y otro justo encima del umbral de 2 UIT
  // -------------------------------------------------------------------------
  console.log('▶ Caso (f): DAOT 2026 (2 UIT = S/ 11,000.00) con tercero en S/ 10,999.00 y tercero en S/ 11,001.00...');
  limpiarEstadoEmpresa();
  COMPRAS_MEMORIA.push(
    {
      id: 'c-daot-bajo',
      empresaId,
      periodoId: '2026-05',
      proveedorId: '20554433221',
      proveedorRuc: '20554433221',
      proveedorRazonSocial: 'PROVEEDOR BAJO UMBRAL E.I.R.L.',
      tipoComprobante: '01',
      serie: 'F001',
      numero: '00007001',
      fechaEmision: '2026-05-10',
      fechaContable: '2026-05-10',
      moneda: 'PEN',
      tipoCambio: 1,
      tipoAdquisicion: '1',
      baseGravada: 10999,
      igv: 1979.82,
      total: 12978.82,
      estado: 'CONTABILIZADO',
      asientoId: 'asi-daot-1',
    } as any,
    {
      id: 'c-daot-alto',
      empresaId,
      periodoId: '2026-06',
      proveedorId: '20601122334',
      proveedorRuc: '20601122334',
      proveedorRazonSocial: 'PROVEEDOR SOBRE UMBRAL S.A.C.',
      tipoComprobante: '01',
      serie: 'F001',
      numero: '00007002',
      fechaEmision: '2026-06-10',
      fechaContable: '2026-06-10',
      moneda: 'PEN',
      tipoCambio: 1,
      tipoAdquisicion: '1',
      baseGravada: 11001,
      igv: 1980.18,
      total: 12981.18,
      estado: 'CONTABILIZADO',
      asientoId: 'asi-daot-2',
    } as any
  );

  const reporteDaot = await daotService.procesarDaot(empresaId, 2026);
  assert.strictEqual(reporteDaot.uitAnual, 5500);
  assert.strictEqual(reporteDaot.umbral2Uit, 11000);

  const terceroBajo = reporteDaot.registros.find((t) => t.numeroDocIdentidad === '20554433221');
  const terceroAlto = reporteDaot.registros.find((t) => t.numeroDocIdentidad === '20601122334');
  assert.ok(terceroBajo, 'Debe existir tercero con S/ 10,999.00');
  assert.ok(terceroAlto, 'Debe existir tercero con S/ 11,001.00');
  assert.strictEqual(terceroBajo!.condicion, 'EXCEPTUADO', 'S/ 10,999.00 (<= 11,000) debe quedar EXCEPTUADO');
  assert.strictEqual(terceroAlto!.condicion, 'DECLARABLE', 'S/ 11,001.00 (> 11,000) debe quedar DECLARABLE');
  assert.strictEqual(reporteDaot.totalTercerosDeclarables, 1);
  console.log(
    `  ✓ Caso (f) OK: Umbral 2 UIT (2026) = S/ ${reporteDaot.umbral2Uit.toFixed(2)} -> Tercero S/ 10,999.00 [${terceroBajo!.condicion}] vs Tercero S/ 11,001.00 [${terceroAlto!.condicion}].`
  );

  // -------------------------------------------------------------------------
  // CASO (g): Cronograma por último dígito de RUC y Buen Contribuyente
  // -------------------------------------------------------------------------
  console.log('▶ Caso (g): Cronograma de vencimientos por último dígito de RUC (0-9) y Buen Contribuyente (B)...');
  const alertaDigito7 = cronogramaVencimientosService.calcularAlertaVencimiento(
    '2026-09',
    '20601234567',
    false,
    '2026-10-19'
  );
  const alertaBuenContrib = cronogramaVencimientosService.calcularAlertaVencimiento(
    '2026-09',
    '20601234567',
    true,
    '2026-10-19'
  );

  assert.strictEqual(alertaDigito7.digitoEvaluado, '7');
  assert.strictEqual(alertaDigito7.fechaVencimientoPdt621, '2026-10-26');
  assert.strictEqual(alertaDigito7.diasRestantesPdt621, 7);
  assert.strictEqual(alertaBuenContrib.digitoEvaluado, 'B');
  assert.strictEqual(alertaBuenContrib.fechaVencimientoPdt621, '2026-10-29');
  assert.strictEqual(alertaBuenContrib.diasRestantesPdt621, 10);
  assert.strictEqual(CRONOGRAMA_VENCIMIENTOS_MEMORIA.some((c) => c.esSupuestoValidar), true);
  console.log(
    `  ✓ Caso (g) OK: RUC terminado en 7 vence ${alertaDigito7.fechaVencimientoPdt621} (${alertaDigito7.diasRestantesPdt621} días restantes); Buen Contribuyente [B] vence ${alertaBuenContrib.fechaVencimientoPdt621} (${alertaBuenContrib.diasRestantesPdt621} días restantes).`
  );

  limpiarEstadoEmpresa();
  console.log('\n✅ TODAS LAS PRUEBAS DE LA FASE 4 (MÓDULO TRIBUTOS A-H) PASARON EXITOSAMENTE.\n');
}

runTestsFase4Tributos().catch((err) => {
  console.error('❌ Error en run_tests_fase4_tributos:', err);
  process.exit(1);
});
