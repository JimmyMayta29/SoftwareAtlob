import assert from 'node:assert/strict';
import {
  calcularImportesAplicacionCartera,
  calcularScoreDocumentoCartera,
} from './carteraConciliacionService';
import {
  PLANTILLAS_ASIENTO_SISTEMA,
  calcularHashVistaPrevia,
  construirLineasPreviewAsiento,
  construirPlantillaSistema,
  interpolarGlosaPlantilla,
  resolverCuentaContrapartidaConfig,
  validarSentidoOperacionAsiento,
} from '../asientos/asientosConciliacionService';
import {
  calcularFechaVencimientoCheque,
  calcularItfEsperado,
  evaluarAntiguedadCheque,
  evaluarBancarizacionLey28194,
  validarTransicionEstadoCheque,
} from '../cheques/chequesYControlService';
import type { ConfigConciliacionV2 } from '../../../types/conciliacionV2';

let pasados = 0;

function caso(nombre: string, fn: () => void): void {
  fn();
  pasados += 1;
  console.log(`  ✅ ${nombre}`);
}

const CONFIG_BASE: ConfigConciliacionV2 = {
  empresaId: '00000000-0000-0000-0000-000000000001',
  conciliacionV2Habilitada: true,
  toleranciaDias: 3,
  toleranciaMonto: '0.00',
  umbralAutoMatch: 0.9,
  cuentaItfCodigo: '6412',
  cuentaComisionCodigo: '6391',
  cuentaInteresGastoCodigo: '67311',
  cuentaInteresIngresoCodigo: null,
  sugerenciaCuentaInteresIngreso: '7793',
  configuradaEnBd: true,
  updatedBy: null,
  updatedAt: null,
};

console.log('\n====================================================================');
console.log('🧪 PRUEBAS UNITARIAS — FASE 4.3 (CARTERA, ASIENTOS Y CHEQUES)');
console.log('====================================================================');

caso('1. Retención IGV (CRE 3%) con Money exacto (ROUND_HALF_UP)', () => {
  // Factura por pagar S/ 2,360.00 -> Retención 3% = S/ 70.80 -> Neto banco S/ 2,289.20
  const res = calcularImportesAplicacionCartera({
    montoLineaAbs: '2289.20',
    totalAplicado: '2360.00',
    tipoOperacionEspecial: 'RETENCION_IGV',
    tieneRetencion: true,
    porcentajeRetencion: 3,
  });

  assert.equal(res.montoRetencion, '70.80');
  assert.equal(res.importeMovimientoTesoreria, '2360.00');
  assert.equal(res.saldoSinAplicar, '0.00');

  // Con montoRetencion explícito y redondeo decimal exacto
  const resExplicito = calcularImportesAplicacionCartera({
    montoLineaAbs: '970.00',
    totalAplicado: '1000.00',
    tipoOperacionEspecial: 'RETENCION_IGV',
    montoRetencion: '30.00',
  });
  assert.equal(resExplicito.montoRetencion, '30.00');
  assert.equal(resExplicito.importeMovimientoTesoreria, '1000.00');
  assert.equal(resExplicito.saldoSinAplicar, '0.00');
});

caso('2. Detracción SPOT y Comisión POS con Money (neto + comisión = total cobranza)', () => {
  // Detracción SPOT aplicada parcialmente contra factura
  const spot = calcularImportesAplicacionCartera({
    montoLineaAbs: '283.20',
    totalAplicado: '283.20',
    tipoOperacionEspecial: 'DETRACCION_SPOT',
  });
  assert.equal(spot.importeMovimientoTesoreria, '283.20');
  assert.equal(spot.saldoSinAplicar, '0.00');

  // Comisión POS: abono neto S/ 964.55 + comisión POS S/ 35.45 = S/ 1,000.00 cobranza total
  const pos = calcularImportesAplicacionCartera({
    montoLineaAbs: '964.55',
    totalAplicado: '1000.00',
    tipoOperacionEspecial: 'COMISION_POS',
    comisionPosMonto: '35.45',
    generarAsientoComisionPos: true,
  });
  assert.equal(pos.comisionPosMonto, '35.45');
  assert.equal(pos.totalCobranzaBruta, '1000.00');
  assert.equal(pos.importeMovimientoTesoreria, '1000.00');
  assert.equal(pos.saldoSinAplicar, '0.00');

  // Anticipo con saldoSinAplicar positivo
  const anticipo = calcularImportesAplicacionCartera({
    montoLineaAbs: '1500.00',
    totalAplicado: '0.00',
    tipoOperacionEspecial: 'ESTANDAR',
    esAnticipo: true,
  });
  assert.equal(anticipo.saldoSinAplicar, '1500.00');

  // Exceso de aplicación bloqueado
  assert.throws(
    () =>
      calcularImportesAplicacionCartera({
        montoLineaAbs: '500.00',
        totalAplicado: '500.01',
        tipoOperacionEspecial: 'ESTANDAR',
      }),
    /IMPORTE_APLICADO_EXCEDE_OPERACION/
  );
});

caso('3. Scoring determinista de sugerencias de cartera (RUC, comprobante, monto, nombre)', () => {
  const exacto = calcularScoreDocumentoCartera({
    montoLineaAbs: '1180.00',
    descripcionLinea: 'ABONO TRANSF RUC 20555666777 FACTURA F001-00045 ACME PERU SAC',
    referenciaLinea: 'F001-45',
    rucExtraido: '20555666777',
    contraparteExtraida: 'ACME PERU',
    docExtraido: 'F001-00045',
    anexoRuc: '20555666777',
    anexoNombre: 'ACME PERU S.A.C.',
    serie: 'F001',
    numero: '00045',
    saldoPendiente: '1180.00',
  });
  assert.equal(exacto.score, 1);
  assert.ok(exacto.motivos.length >= 3);

  const soloParcial = calcularScoreDocumentoCartera({
    montoLineaAbs: '500.00',
    descripcionLinea: 'ABONO VARIOS',
    referenciaLinea: null,
    rucExtraido: null,
    contraparteExtraida: null,
    docExtraido: null,
    anexoRuc: '20111222333',
    anexoNombre: 'OTRA EMPRESA SRL',
    serie: 'F002',
    numero: '00999',
    saldoPendiente: '1200.00',
  });
  assert.ok(soloParcial.score < exacto.score);
  assert.equal(soloParcial.score, 0.15);
});

caso('4. Vista previa de asientos: hash SHA-256 determinístico, detección de cambio y bloqueo INTERES_INGRESO', () => {
  // Catálogo sistema nunca autoguarda '7793' cuando config.cuentaInteresIngresoCodigo es null
  const defInteresIng = PLANTILLAS_ASIENTO_SISTEMA.find(
    (p) => p.tipoOperacion === 'INTERES_INGRESO'
  )!;
  const tplInteresIng = construirPlantillaSistema(defInteresIng, CONFIG_BASE.empresaId, CONFIG_BASE);
  assert.equal(tplInteresIng.cuentaContrapartidaCodigo, null);
  assert.equal(resolverCuentaContrapartidaConfig('INTERES_INGRESO', CONFIG_BASE), null);

  // Sentido incompatible bloqueado
  assert.throws(
    () => validarSentidoOperacionAsiento('ITF', '10.00'),
    /SENTIDO_MONTO_INCOMPATIBLE/
  );
  assert.throws(
    () => validarSentidoOperacionAsiento('INTERES_INGRESO', '-10.00'),
    /SENTIDO_MONTO_INCOMPATIBLE/
  );

  const calc = construirLineasPreviewAsiento({
    montoExtracto: '-5.00',
    cuentaBanco: { id: 'cta-1041', codigo: '1041', nombre: 'Cuentas corrientes operativas' },
    cuentaContrapartida: { id: 'cta-6412', codigo: '6412', nombre: 'Impuesto a las transacciones financieras' },
    anexoId: null,
    centroCostoId: null,
    glosa: 'ITF bancario - Cargo ITF',
  });

  assert.equal(calc.cuadrado, true);
  assert.equal(calc.totalDebe, '5.00');
  assert.equal(calc.totalHaber, '5.00');
  assert.equal(calc.lineas[0].cuentaCodigo, '6412');
  assert.equal(calc.lineas[0].debe, '5.00');
  assert.equal(calc.lineas[1].cuentaCodigo, '1041');
  assert.equal(calc.lineas[1].haber, '5.00');

  const glosaInterp = interpolarGlosaPlantilla('ITF bancario - {descripcion}', {
    descripcion: 'CARGO ITF',
    fecha: '2026-10-15',
    referencia: 'ITF-01',
    monto: '5.00',
  });
  assert.equal(glosaInterp, 'ITF bancario - CARGO ITF');

  const hash1 = calcularHashVistaPrevia({
    extractoLineaId: '11111111-1111-4111-8111-111111111111',
    tipoOperacion: 'ITF',
    fecha: '2026-10-15',
    periodo: '2026-10',
    subdiarioCodigo: '05',
    moneda: 'PEN',
    tipoCambio: '1.0000',
    glosa: glosaInterp,
    lineas: calc.lineas,
  });

  const hash2 = calcularHashVistaPrevia({
    extractoLineaId: '11111111-1111-4111-8111-111111111111',
    tipoOperacion: 'ITF',
    fecha: '2026-10-15',
    periodo: '2026-10',
    subdiarioCodigo: '05',
    moneda: 'PEN',
    tipoCambio: '1.0000',
    glosa: glosaInterp,
    lineas: calc.lineas,
  });
  assert.equal(hash1, hash2);

  // Alterar un céntimo en una línea o cambiar glosa cambia el hash SHA-256
  const lineasAlteradas = calc.lineas.map((l, idx) =>
    idx === 0 ? { ...l, debe: '5.01' } : { ...l, haber: '5.01' }
  );
  const hashAlterado = calcularHashVistaPrevia({
    extractoLineaId: '11111111-1111-4111-8111-111111111111',
    tipoOperacion: 'ITF',
    fecha: '2026-10-15',
    periodo: '2026-10',
    subdiarioCodigo: '05',
    moneda: 'PEN',
    tipoCambio: '1.0000',
    glosa: glosaInterp,
    lineas: lineasAlteradas,
  });
  assert.notEqual(hash1, hashAlterado);
});

caso('5. ITF esperado 0.005% (Money) y Bancarización Ley 28194 (S/ 2,000 / US$ 500)', () => {
  // 1000.00 * 0.00005 = 0.05
  const itf1000 = calcularItfEsperado('1000.00');
  assert.equal(itf1000.itfExacto, '0.05');
  assert.equal(itf1000.itfRedondeado, '0.05');

  // 500.00 * 0.00005 = 0.025 -> redondeado SUNAT a 0.05 (ROUND_HALF_UP sobre múltiplos de 0.05)
  const itf500 = calcularItfEsperado('500.00');
  assert.equal(itf500.itfExacto, '0.03');
  assert.equal(itf500.itfRedondeado, '0.05');

  // 400.00 * 0.00005 = 0.020 -> redondeado a múltiplos de 0.05 = 0.00
  const itf400 = calcularItfEsperado('400.00');
  assert.equal(itf400.itfRedondeado, '0.00');

  // 2500.00 * 0.00005 = 0.125 -> múltiplo 0.05 más cercano = 0.15
  const itf2500 = calcularItfEsperado('2500.00');
  assert.equal(itf2500.itfRedondeado, '0.15');

  // Bancarización PEN: S/ 1,999.99 en efectivo -> OK; S/ 2,000.00 en efectivo -> CRITICA
  const penBajo = evaluarBancarizacionLey28194({
    moneda: 'PEN',
    monto: '1999.99',
    medioPago: '008',
  });
  assert.equal(penBajo.aplicaControl, false);

  const penUmbral = evaluarBancarizacionLey28194({
    moneda: 'PEN',
    monto: '2000.00',
    medioPago: '008',
  });
  assert.equal(penUmbral.aplicaControl, true);
  assert.equal(penUmbral.severidad, 'CRITICA');
  assert.equal(penUmbral.umbralLegal, '2000.00');

  // Bancarización USD: US$ 499.99 en efectivo -> OK; US$ 500.00 en efectivo -> CRITICA
  const usdBajo = evaluarBancarizacionLey28194({
    moneda: 'USD',
    monto: '499.99',
    medioPago: '009',
  });
  assert.equal(usdBajo.aplicaControl, false);

  const usdUmbral = evaluarBancarizacionLey28194({
    moneda: 'USD',
    monto: '500.00',
    medioPago: '009',
  });
  assert.equal(usdUmbral.aplicaControl, true);
  assert.equal(usdUmbral.severidad, 'CRITICA');
  assert.equal(usdUmbral.umbralLegal, '500.00');

  // Transferencia bancaria >= 2,000 PEN cumple bancarización
  const transfOk = evaluarBancarizacionLey28194({
    moneda: 'PEN',
    monto: '5000.00',
    medioPago: '003',
  });
  assert.equal(transfOk.aplicaControl, false);

  // Cheque sin cláusula NO NEGOCIABLE >= umbral genera ADVERTENCIA
  const chequeSinClausula = evaluarBancarizacionLey28194({
    moneda: 'PEN',
    monto: '3000.00',
    medioPago: '007',
    esNoNegociable: false,
  });
  assert.equal(chequeSinClausula.aplicaControl, true);
  assert.equal(chequeSinClausula.severidad, 'ADVERTENCIA');
});

caso('6. Máquina de estados de cheques y control de antigüedad (20 / 30 días)', () => {
  // Vencimiento por defecto +30 días
  assert.equal(calcularFechaVencimientoCheque('2026-10-01'), '2026-10-31');
  assert.equal(calcularFechaVencimientoCheque('2026-10-01', '2026-10-20'), '2026-10-20');

  // Antigüedad
  const reciente = evaluarAntiguedadCheque({
    fechaGiro: '2026-10-15',
    fechaCorte: '2026-10-31',
    estado: 'GIRADO',
  });
  assert.equal(reciente.diasTranscurridos, 16);
  assert.equal(reciente.enAlerta, false);

  const porVencer = evaluarAntiguedadCheque({
    fechaGiro: '2026-10-05',
    fechaCorte: '2026-10-25',
    estado: 'ENTREGADO',
  });
  assert.equal(porVencer.diasTranscurridos, 20);
  assert.equal(porVencer.enAlerta, true);
  assert.equal(porVencer.vencidoPlazoLegal, false);

  const vencido = evaluarAntiguedadCheque({
    fechaGiro: '2026-09-25',
    fechaCorte: '2026-10-31',
    estado: 'GIRADO',
  });
  assert.equal(vencido.diasTranscurridos, 36);
  assert.equal(vencido.enAlerta, true);
  assert.equal(vencido.vencidoPlazoLegal, true);

  // Transiciones válidas
  validarTransicionEstadoCheque('GIRADO', 'ENTREGADO');
  validarTransicionEstadoCheque('GIRADO', 'COBRADO');
  validarTransicionEstadoCheque('GIRADO', 'VENCIDO');
  validarTransicionEstadoCheque('GIRADO', 'ANULADO');
  validarTransicionEstadoCheque('ENTREGADO', 'COBRADO');
  validarTransicionEstadoCheque('ENTREGADO', 'VENCIDO');
  validarTransicionEstadoCheque('ENTREGADO', 'ANULADO');
  validarTransicionEstadoCheque('VENCIDO', 'ANULADO');
  validarTransicionEstadoCheque('VENCIDO', 'COBRADO');

  // Transiciones inválidas
  const invalidas: Array<[Parameters<typeof validarTransicionEstadoCheque>[0], Parameters<typeof validarTransicionEstadoCheque>[1]]> = [
    ['GIRADO', 'GIRADO'],
    ['ENTREGADO', 'GIRADO'],
    ['VENCIDO', 'GIRADO'],
    ['VENCIDO', 'ENTREGADO'],
    ['COBRADO', 'ANULADO'],
    ['COBRADO', 'GIRADO'],
    ['ANULADO', 'COBRADO'],
    ['ANULADO', 'GIRADO'],
  ];

  for (const [desde, hasta] of invalidas) {
    assert.throws(
      () => validarTransicionEstadoCheque(desde, hasta),
      /TRANSICION_CHEQUE_INVALIDA/,
      `Debe rechazar transición ${desde} -> ${hasta}`
    );
  }
});

console.log(`\n✅ ${pasados} casos unitarios Fase 4.3 superados exitosamente.\n`);
