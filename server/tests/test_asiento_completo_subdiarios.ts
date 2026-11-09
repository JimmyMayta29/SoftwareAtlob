process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import assert from 'node:assert/strict';
import { contabilizacionService } from '../services/contabilizacionService';
import { compraService } from '../services/compraService';
import { EMPRESAS_STORE } from '../repositories/empresaRepository';

async function ejecutarSuitePruebas() {
  console.log('========================================================================');
  console.log('SUITE DE VERIFICACION: ASIENTO COMPLETO, REGLAS TRIBUTARIAS Y SUBDIARIOS');
  console.log('========================================================================\n');

  const empresaId = 'emp-test-completo';
  EMPRESAS_STORE.length = 0; // Limpiar store en memoria
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

  // -------------------------------------------------------------------------
  // CASO 1: Asiento completo con Percepción (2%) y Detracción (10%) sin Retención
  // -------------------------------------------------------------------------
  console.log('--- CASO 1: Asiento completo con Percepción y Detracción (sin Retención) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-01',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00008888',
      fechaEmision: '2026-09-10',
      fechaContable: '2026-09-10',
      baseImponible: 1000.00,
      cuentaCompra: '60111',
      desgloseCuentas: [
        { cuentaCodigo: '60111', denominacion: 'Mercaderías manufacturadas A', monto: 700.00, centroCostoId: 'CC-01' },
        { cuentaCodigo: '60111', denominacion: 'Mercaderías manufacturadas B', monto: 300.00, centroCostoId: 'CC-02' }
      ],
      exonerado: 300.00,
      isc: 50.00,
      icbper: 2.00,
      otrosTributos: 10.00,
      tienePercepcion: true,
      montoPercepcion: 30.84, // 2% de 1542.00
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      tieneDetraccion: true,
      montoDetraccion: 154.20, // 10% de 1542.00
      tieneRetencion: false,
      montoRetencion: 0,
      glosa: 'Compra de mercaderías con desglose completo de tributos y percepción'
    });

    console.log(`Líneas generadas: ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 1: El asiento contable debe estar 100% cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 1: Diferencia debe ser 0.00');

    // Cuentas requeridas
    const ctas = prop.lineas.map(l => l.codigoCuenta);
    assert.ok(ctas.includes('60111'), 'Debe usar cuenta detalle 60111');
    assert.ok(!ctas.includes('6011'), 'No debe usar subcuenta 6011');
    assert.ok(ctas.includes('40111'), 'Debe incluir IGV 40111');
    assert.ok(ctas.includes('6412'), 'Debe incluir ISC 6412');
    assert.ok(ctas.includes('6413'), 'Debe incluir ICBPER 6413');
    assert.ok(ctas.includes('6491'), 'Debe incluir Otros Tributos 6491');
    assert.ok(ctas.includes('40113'), 'Debe incluir Percepción 40113');
    assert.ok(ctas.includes('4213'), 'Debe incluir Detracción SPOT 4213');
    assert.ok(ctas.includes('4212'), 'Debe incluir Facturas por pagar neto 4212');
    assert.ok(ctas.includes('20111'), 'Debe incluir Destino Inventarios 20111');
    assert.ok(ctas.includes('6111'), 'Debe incluir Variación Existencias 6111');

    // Obligación neta comprobante: Total (1542.00) + Percepcion (30.84) - Detraccion (154.20) = 1418.64
    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 1418.64, 'Neto por pagar 4212 debe ser exactamente S/ 1,418.64');

    console.log('✔ Caso 1 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // CASO 2: Asiento con Retención (3%) y Detracción (12%), sin Percepción
  // -------------------------------------------------------------------------
  console.log('--- CASO 2: Asiento con Retención (3%) y Detracción (12%) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-02',
      docTipo: '01',
      docSerie: 'F002',
      docNumero: '00001234',
      fechaEmision: '2026-09-12',
      fechaContable: '2026-09-12',
      baseImponible: 2000.00,
      cuentaCompra: '60111',
      tienePercepcion: false,
      montoPercepcion: 0,
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      tieneDetraccion: true,
      montoDetraccion: 283.20, // 12% de 2360.00
      tieneRetencion: true,
      montoRetencion: 70.80,   // 3% de 2360.00
      glosa: 'Servicio / compra con detracción y retención de IGV'
    });

    console.log(`Líneas generadas: ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 2: El asiento debe estar cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 2: Diferencia debe ser 0.00');

    // Neto a pagar 4212: Total 2360.00 - 283.20 (SPOT) - 70.80 (Retención) = 2006.00
    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 2006.00, 'Neto por pagar 4212 debe ser S/ 2,006.00');

    const lRet = prop.lineas.find(l => l.codigoCuenta === '40114');
    assert.equal(lRet?.haber, 70.80, 'Retención 40114 debe ser S/ 70.80');

    const lDet = prop.lineas.find(l => l.codigoCuenta === '4213');
    assert.equal(lDet?.haber, 283.20, 'Detracción SPOT 4213 debe ser S/ 283.20');

    console.log('✔ Caso 2 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // CASO 3: Bloqueo de combinación prohibida (Retención + Percepción)
  // -------------------------------------------------------------------------
  console.log('--- CASO 3: Bloqueo de Retención + Percepción en el mismo comprobante ---');
  {
    // A nivel contabilizacionService
    await assert.rejects(
      async () => {
        await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
          proveedorId: 'anx-prov-03',
          docTipo: '01',
          docSerie: 'F003',
          docNumero: '00000001',
          fechaEmision: '2026-09-15',
          fechaContable: '2026-09-15',
          baseImponible: 1000.00,
          cuentaCompra: '60111',
          tienePercepcion: true,
          montoPercepcion: 20.00,
          tieneRetencion: true,
          montoRetencion: 30.00,
          destino: '1'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('COMBINACION_TRIBUTARIA_BLOQUEADA'), 'Debe arrojar COMBINACION_TRIBUTARIA_BLOQUEADA');
        return true;
      }
    );

    // A nivel compraService.validarCoherencia
    assert.throws(
      () => {
        compraService.validarCoherencia({
          periodoId: '2026-09',
          fechaEmision: '2026-09-15',
          fechaContable: '2026-09-15',
          tipoComprobante: '01',
          serie: 'F003',
          numero: '00000001',
          proveedorId: 'prv-1',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: 1000,
          igv: 180,
          total: 1180,
          tipoAdquisicion: '1',
          formaPago: 'CONTADO',
          tienePercepcion: true,
          montoPercepcion: 23.60,
          tieneRetencion: true,
          montoRetencion: 35.40
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('COMBINACION_TRIBUTARIA_BLOQUEADA'));
        return true;
      }
    );

    console.log('✔ Caso 3 superado exitosamente (bloqueo activo en frontend/backend/contabilidad).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 4: Tasa reducida de IGV al 10% (Ley 31556) vigente en 2026
  // -------------------------------------------------------------------------
  console.log('--- CASO 4: Tasa reducida de IGV al 10% dentro de vigencia legal (2026) ---');
  {
    // Base 1000, IGV 10% = 100, Total 1100
    compraService.validarCoherencia({
      periodoId: '2026-09',
      fechaEmision: '2026-09-20',
      fechaContable: '2026-09-20',
      tipoComprobante: '01',
      serie: 'F004',
      numero: '00009999',
      proveedorId: 'prv-1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      baseGravada: 1000.00,
      igv: 100.00, // 10%
      total: 1100.00,
      tipoAdquisicion: '1',
      formaPago: 'CONTADO'
    });

    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-04',
      docTipo: '01',
      docSerie: 'F004',
      docNumero: '00009999',
      fechaEmision: '2026-09-20',
      fechaContable: '2026-09-20',
      baseImponible: 1000.00,
      tasaIgv: 0.10,
      igv: 100.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Compra restaurante MYPE tasa reducida 10%'
    });

    const lIgv = prop.lineas.find(l => l.codigoCuenta === '40111');
    assert.equal(lIgv?.debe, 100.00, 'IGV 10% debe ser S/ 100.00');
    assert.equal(prop.cuadrado, true, 'Asiento debe cuadrar');

    console.log('✔ Caso 4 superado exitosamente (tasa 10% procesada y contabilizada).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 5: Tasa reducida de IGV al 10% fuera de vigencia legal (ejercicio 2027)
  // -------------------------------------------------------------------------
  console.log('--- CASO 5: Tasa reducida al 10% rechazada fuera de vigencia (2027) ---');
  {
    assert.throws(
      () => {
        compraService.validarCoherencia({
          periodoId: '2027-01',
          fechaEmision: '2027-01-15',
          fechaContable: '2027-01-15',
          tipoComprobante: '01',
          serie: 'F005',
          numero: '00000001',
          proveedorId: 'prv-1',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: 1000.00,
          igv: 100.00, // 10% en 2027
          total: 1100.00,
          tipoAdquisicion: '1',
          formaPago: 'CONTADO'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('TASA_IGV_FUERA_VIGENCIA'), 'Debe rechazar con TASA_IGV_FUERA_VIGENCIA');
        return true;
      }
    );

    console.log('✔ Caso 5 superado exitosamente (rechazo automático en ejercicio 2027).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 6: Detracción con porcentaje manual no justificado
  // -------------------------------------------------------------------------
  console.log('--- CASO 6: Detracción manual sin justificación rechazada ---');
  {
    // Bien '022' (Otros servicios empresariales) tasa oficial 12%. Ingresado 8% sin justificación.
    assert.throws(
      () => {
        compraService.validarCoherencia({
          periodoId: '2026-09',
          fechaEmision: '2026-09-10',
          fechaContable: '2026-09-10',
          tipoComprobante: '01',
          serie: 'F006',
          numero: '00000001',
          proveedorId: 'prv-1',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: 1000.00,
          igv: 180.00,
          total: 1180.00,
          tipoAdquisicion: '1',
          formaPago: 'CONTADO',
          tieneDetraccion: true,
          codigoBienDetraccion: '022',
          porcentajeDetraccion: 8 // Difiere de 12%
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('TASA_DETRACCION_REQUIERE_JUSTIFICACION'));
        return true;
      }
    );

    // Con justificación válida SÍ debe pasar:
    compraService.validarCoherencia({
      periodoId: '2026-09',
      fechaEmision: '2026-09-10',
      fechaContable: '2026-09-10',
      tipoComprobante: '01',
      serie: 'F006',
      numero: '00000001',
      proveedorId: 'prv-1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      baseGravada: 1000.00,
      igv: 180.00,
      total: 1180.00,
      tipoAdquisicion: '1',
      formaPago: 'CONTADO',
      tieneDetraccion: true,
      codigoBienDetraccion: '022',
      porcentajeDetraccion: 8,
      justificacionTasaDetraccion: 'Convenio de estabilidad y tasa reducida según RS 183-2004 Art 12'
    });

    console.log('✔ Caso 6 superado exitosamente (tasa no oficial requiere justificación).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 7: Moneda extranjera (USD) con Tipo de Cambio
  // -------------------------------------------------------------------------
  console.log('--- CASO 7: Moneda extranjera (USD) con tipo de cambio ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-usd',
      docTipo: '01',
      docSerie: 'F007',
      docNumero: '00000077',
      fechaEmision: '2026-09-22',
      fechaContable: '2026-09-22',
      baseImponible: 1000.00, // USD 1,000.00
      igv: 180.00,           // USD 180.00
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'USD',
      tipoCambio: 3.750,     // Equivalente PEN: Base S/ 3,750, IGV S/ 675, Total S/ 4,425
      glosa: 'Importación o compra en dólares americanos'
    });

    console.log(`Líneas generadas en moneda extranjera (convertidas a PEN para el Libro Diario):`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea}`);
    });

    assert.equal(prop.cuadrado, true, 'Asiento en USD convertido a PEN debe cuadrar');
    assert.equal(prop.diferencia, 0, 'Diferencia debe ser 0.00');

    const l60 = prop.lineas.find(l => l.codigoCuenta === '60111');
    assert.equal(l60?.debe, 3750.00, 'Base en PEN debe ser 1000 * 3.75 = S/ 3,750.00');

    const l40 = prop.lineas.find(l => l.codigoCuenta === '40111');
    assert.equal(l40?.debe, 675.00, 'IGV en PEN debe ser 180 * 3.75 = S/ 675.00');

    const l42 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l42?.haber, 4425.00, 'Pasivo en PEN debe ser 1180 * 3.75 = S/ 4,425.00');

    console.log('✔ Caso 7 superado exitosamente (conversión USD/PEN precisa).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 8: Tolerancia de 0.05 soles por redondeo y rechazo ante mayor desbalance
  // -------------------------------------------------------------------------
  console.log('--- CASO 8: Tolerancia de redondeo (0.05) vs desbalance inadmisible ---');
  {
    // Diferencia de 0.03 soles: debe ser tolerada
    compraService.validarCoherencia({
      periodoId: '2026-09',
      fechaEmision: '2026-09-10',
      fechaContable: '2026-09-10',
      tipoComprobante: '01',
      serie: 'F008',
      numero: '00000001',
      proveedorId: 'prv-1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      baseGravada: 100.00,
      igv: 18.00,
      total: 118.03, // 0.03 de diferencia por redondeo de centavos
      tipoAdquisicion: '1',
      formaPago: 'CONTADO'
    });

    // Diferencia de 0.08 soles: debe ser rechazada
    assert.throws(
      () => {
        compraService.validarCoherencia({
          periodoId: '2026-09',
          fechaEmision: '2026-09-10',
          fechaContable: '2026-09-10',
          tipoComprobante: '01',
          serie: 'F008',
          numero: '00000002',
          proveedorId: 'prv-1',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: 100.00,
          igv: 18.00,
          total: 118.08, // 0.08 de diferencia (excede 0.05)
          tipoAdquisicion: '1',
          formaPago: 'CONTADO'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('COHERENCIA_SUMAS_INVALIDA'));
        return true;
      }
    );

    console.log('✔ Caso 8 superado exitosamente (tolerancia de 0.05 respetada y acotada).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 9: Comprobación estricta de importes no negativos
  // -------------------------------------------------------------------------
  console.log('--- CASO 9: Comprobación de importes no negativos ---');
  {
    assert.throws(
      () => {
        compraService.validarCoherencia({
          periodoId: '2026-09',
          fechaEmision: '2026-09-10',
          fechaContable: '2026-09-10',
          tipoComprobante: '01',
          serie: 'F009',
          numero: '00000001',
          proveedorId: 'prv-1',
          moneda: 'PEN',
          tipoCambio: 1.0,
          baseGravada: -100.00, // Importe negativo
          igv: 18.00,
          total: 118.00,
          tipoAdquisicion: '1',
          formaPago: 'CONTADO'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('IMPORTE_NEGATIVO_INVALIDO'));
        return true;
      }
    );

    console.log('✔ Caso 9 superado exitosamente (bloqueo de importes negativos).\n');
  }

  console.log('========================================================================');
  console.log('TODAS LAS PRUEBAS DE ASIENTO COMPLETO Y VALIDACIONES PASARON AL 100%');
  console.log('========================================================================');
}

ejecutarSuitePruebas().catch((err) => {
  console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS:\n', err);
  process.exit(1);
});
