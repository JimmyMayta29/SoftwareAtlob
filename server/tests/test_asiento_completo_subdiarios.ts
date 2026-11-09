process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import assert from 'node:assert/strict';
import { contabilizacionService } from '../services/contabilizacionService';
import { EMPRESAS_STORE } from '../repositories/empresaRepository';

async function testAsientoCompleto() {
  console.log('--- Test de Asientos Contables Completos (SUNAT / PCGE) ---');

  const empresaId = 'emp-test-completo';
  EMPRESAS_STORE.push({
    id: empresaId,
    tenantId: 'tenant-test',
    codigoEmpresa: 'TESTCOMPLETO',
    ruc: '20601234567',
    razonSocial: 'EMPRESA PRUEBA COMPLETA S.A.C.',
    regimenTributario: 'REGIMEN_GENERAL',
    domicilioFiscal: 'AV. PRINCIPAL 100',
    monedaPrincipal: 'PEN',
    metodoInventario: 'PERMANENTE',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as any);

  // 1. Simular comprobante completo:
  // Base Gravada: S/ 1,000.00 -> IGV (18%): S/ 180.00
  // No Gravadas / Exoneradas: S/ 300.00
  // ISC: S/ 50.00
  // ICBPER: S/ 2.00
  // Otros Tributos: S/ 10.00
  // Percepción (2%): S/ 30.84
  // Total Comprobante Bruto: S/ 1,542.00 + Percepción S/ 30.84 = S/ 1,572.84
  // Detracción SPOT (10% de 1542): S/ 154.20
  // Retención IGV (3% de 1542): S/ 46.26
  // Neto a Pagar Proveedor (4212): S/ 1,572.84 - S/ 154.20 - S/ 46.26 = S/ 1,372.38

  const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
    proveedorId: 'anx-prov-01',
    docTipo: '01',
    docSerie: 'F001',
    docNumero: '00008888',
    fechaEmision: '2026-09-10',
    fechaContable: '2026-09-10',
    baseImponible: 1000.00,
    cuentaCompra: '6011',
    desgloseCuentas: [
      { cuentaCodigo: '60111', denominacion: 'Mercaderías manufacturadas A', monto: 700.00, centroCostoId: 'CC-01' },
      { cuentaCodigo: '60112', denominacion: 'Mercaderías manufacturadas B', monto: 300.00, centroCostoId: 'CC-02' }
    ],
    exonerado: 300.00,
    isc: 50.00,
    icbper: 2.00,
    otrosTributos: 10.00,
    tienePercepcion: true,
    montoPercepcion: 30.84,
    destino: '1',
    moneda: 'PEN',
    tipoCambio: 1.0,
    tieneDetraccion: true,
    montoDetraccion: 154.20,
    tieneRetencion: true,
    montoRetencion: 46.26,
    glosa: 'Compra de mercaderías con desglose completo de tributos y percepciones'
  });

  console.log(`Líneas generadas: ${prop.lineas.length}`);
  prop.lineas.forEach((l) => {
    console.log(`L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(8)} | H: ${l.haber.toFixed(2).padStart(8)} | ${l.glosaLinea || l.denominacionCuenta}`);
  });

  console.log(`Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Diferencia: S/ ${prop.diferencia.toFixed(2)}`);

  // Aserciones de verificación
  assert.equal(prop.cuadrado, true, 'El asiento contable debe estar 100% cuadrado en partida doble.');
  assert.equal(prop.diferencia, 0, 'La diferencia entre Debe y Haber debe ser exactamente 0.00.');

  // Verificar presencia de todas las cuentas requeridas
  const ctas = prop.lineas.map(l => l.codigoCuenta);
  assert.ok(ctas.includes('60111'), 'Debe incluir desglose cuenta 60111');
  assert.ok(ctas.includes('60112'), 'Debe incluir desglose cuenta 60112');
  assert.ok(ctas.includes('40111'), 'Debe incluir IGV 40111');
  assert.ok(ctas.includes('6412'), 'Debe incluir ISC 6412');
  assert.ok(ctas.includes('6413'), 'Debe incluir ICBPER 6413');
  assert.ok(ctas.includes('6491'), 'Debe incluir Otros Tributos 6491');
  assert.ok(ctas.includes('40113'), 'Debe incluir Percepciones 40113');
  assert.ok(ctas.includes('40114'), 'Debe incluir Retenciones 40114');
  assert.ok(ctas.includes('4213'), 'Debe incluir Detracción SPOT 4213');
  assert.ok(ctas.includes('4212'), 'Debe incluir Facturas por pagar neto 4212');
  assert.ok(ctas.includes('20111'), 'Debe incluir Destino Inventarios 20111 (Método Permanente)');
  assert.ok(ctas.includes('6111'), 'Debe incluir Variación Existencias 6111');

  console.log('✔ TODAS LAS ASERCIONES DEL ASIENTO COMPLETO PASARON EXITOSAMENTE');
}

testAsientoCompleto().catch((err) => {
  console.error('ERROR EN TEST:', err);
  process.exit(1);
});
