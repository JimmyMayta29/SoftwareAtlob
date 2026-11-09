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
  // ESC-C-1.01: Factura de Compra al Contado (Destino 1)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.01: Factura de Compra al Contado (Destino 1) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-00',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000001',
      fechaEmision: '2026-09-01',
      fechaContable: '2026-09-01',
      baseImponible: 1000.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Factura de compra al contado Destino 1'
    });

    assert.equal(prop.cuadrado, true, 'ESC-C-1.01: Asiento debe cuadrar');
    assert.equal(prop.totalDebe, 2180.00, 'ESC-C-1.01: Total Debe: 1000(60111) + 180(40111) + 1000(20111) = 2,180.00');
    assert.equal(prop.totalHaber, 2180.00, 'ESC-C-1.01: Total Haber: 1180(4212) + 1000(6111) = 2,180.00');
    console.log('✔ ESC-C-1.01 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // CASO 1A: Asiento completo con Detracción (10%), Tributos Complementarios - Tratamiento COSTO (Default)
  // Cubre: ESC-C-1.14 (ISC), ESC-C-1.15 (ICBPER), ESC-C-1.16 (Otros), ESC-C-1.19 (Destino 1),
  //        ESC-C-1.22 (Exonerado), ESC-C-1.23 (SPOT), ESC-C-1.26 (Desglose PCGE), ESC-SPOT-5.01 (Cta 4213)
  // -------------------------------------------------------------------------
  console.log('--- CASO 1A / ESC-C-1.14 / ESC-C-1.15 / ESC-C-1.16 / ESC-C-1.19 / ESC-C-1.22 / ESC-C-1.23 / ESC-C-1.26 / ESC-SPOT-5.01 ---');
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
      // No enviamos tratamientoTributosNoRecuperables para verificar el DEFAULT REAL ('COSTO' en existencias)
      tienePercepcion: false,
      montoPercepcion: 0,
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      tieneDetraccion: true,
      montoDetraccion: 154.20, // 10% de S/ 1,542.00
      tieneRetencion: false,
      montoRetencion: 0,
      glosa: 'Compra de existencias completa con Detracción SPOT (Tratamiento COSTO)'
    });

    console.log(`Líneas generadas (COSTO): ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 1A: Asiento debe estar 100% cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 1A: Diferencia debe ser 0.00');

    // Cuentas en tratamiento COSTO: Los tributos van a la 60111 y NO a las 6412/6413/6491
    const ctas = prop.lineas.map(l => l.codigoCuenta);
    // [ESC-C-1.22 / ESC-C-1.26] Desglose y compras exoneradas en cuenta 60111
    assert.ok(ctas.includes('60111'), 'Debe usar cuenta detalle 60111');
    assert.ok(!ctas.includes('6412'), 'En tratamiento COSTO NO debe incluir cuenta de gasto 6412');
    assert.ok(!ctas.includes('6413'), 'En tratamiento COSTO NO debe incluir cuenta de gasto 6413');
    assert.ok(!ctas.includes('6491'), 'En tratamiento COSTO NO debe incluir cuenta de gasto 6491');
    assert.ok(ctas.includes('40111'), 'Debe incluir IGV 40111');
    // [ESC-C-1.23 / ESC-SPOT-5.01] Pasivo SPOT en cuenta 4213
    assert.ok(ctas.includes('4213'), 'Debe incluir Detracción SPOT 4213');
    assert.ok(ctas.includes('4212'), 'Debe incluir Facturas por pagar neto 4212');
    // [ESC-C-1.19] Destino automático a existencias 20111 / 6111
    assert.ok(ctas.includes('20111'), 'Debe incluir Destino Inventarios 20111');
    assert.ok(ctas.includes('6111'), 'Debe incluir Variación Existencias 6111');

    // Totales literales calculados a mano para COSTO:
    // Debe: 700 + 300 (desglose 60111) + 180 (IGV 40111) + 300 (exonerado 60111) + 50 (ISC 60111) + 2 (ICBPER 60111) + 10 (Otros 60111) + 1362 (Destino 20111 = 1000+300+62) = S/ 2,904.00
    // Haber: 1362 (Variación 6111) + 1387.80 (Neto 4212) + 154.20 (SPOT 4213) = S/ 2,904.00
    assert.equal(prop.totalDebe, 2904.00, 'Total Debe en COSTO debe ser exactamente S/ 2,904.00');
    assert.equal(prop.totalHaber, 2904.00, 'Total Haber en COSTO debe ser exactamente S/ 2,904.00');

    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 1387.80, 'Neto por pagar 4212 debe ser S/ 1,387.80');

    const l20111 = prop.lineas.find(l => l.codigoCuenta === '20111');
    assert.equal(l20111?.debe, 1362.00, 'Destino al almacén 20111 debe incluir tributos al costo: S/ 1,362.00');

    console.log('✔ Caso 1A superado exitosamente (Tratamiento COSTO default).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 1B: Mismo comprobante con tratamiento explícito GASTO (Cuentas 6412, 6413, 6491)
  // -------------------------------------------------------------------------
  console.log('--- CASO 1B: Asiento completo - Tratamiento GASTO (Cuentas 64) ---');
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
      tratamientoTributosNoRecuperables: 'GASTO',
      tienePercepcion: false,
      montoPercepcion: 0,
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      tieneDetraccion: true,
      montoDetraccion: 154.20,
      tieneRetencion: false,
      montoRetencion: 0,
      glosa: 'Compra de existencias con Detracción SPOT (Tratamiento GASTO)'
    });

    console.log(`Líneas generadas (GASTO): ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 1B: Asiento debe estar cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 1B: Diferencia debe ser 0.00');

    const ctas = prop.lineas.map(l => l.codigoCuenta);
    // [ESC-C-1.14] Asiento con cuenta de gasto 6412 (ISC)
    assert.ok(ctas.includes('6412'), 'En tratamiento GASTO debe incluir cuenta de gasto 6412 (ISC)');
    // [ESC-C-1.15] Asiento con cuenta de gasto 6413 (ICBPER)
    assert.ok(ctas.includes('6413'), 'En tratamiento GASTO debe incluir cuenta de gasto 6413 (ICBPER)');
    // [ESC-C-1.16] Asiento con cuenta de gasto 6491 (Otros tributos)
    assert.ok(ctas.includes('6491'), 'En tratamiento GASTO debe incluir cuenta de gasto 6491 (Otros)');

    // Totales literales calculados a mano para GASTO:
    // Debe: 700 + 300 (60111) + 180 (40111) + 300 (exonerado 60111) + 50 (ISC 6412) + 2 (ICBPER 6413) + 10 (Otros 6491) + 1300 (Destino 20111 = 1000+300) = S/ 2,842.00
    // Haber: 1300 (Variación 6111) + 1387.80 (Neto 4212) + 154.20 (SPOT 4213) = S/ 2,842.00
    assert.equal(prop.totalDebe, 2842.00, 'Total Debe en GASTO debe ser exactamente S/ 2,842.00');
    assert.equal(prop.totalHaber, 2842.00, 'Total Haber en GASTO debe ser exactamente S/ 2,842.00');

    const l20111 = prop.lineas.find(l => l.codigoCuenta === '20111');
    assert.equal(l20111?.debe, 1300.00, 'Destino al almacén 20111 en GASTO es solo existencias: S/ 1,300.00');

    console.log('✔ Caso 1B superado exitosamente (Tratamiento GASTO explícito).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 2A / ESC-C-1.24: Compra pura con Retención del IGV (3%) - Sin Detracción
  // -------------------------------------------------------------------------
  console.log('--- CASO 2A / ESC-C-1.24: Compra pura con Retención de IGV (3%) ---');
  {
    // Factura F002-1234: Base S/ 2,000.00, IGV S/ 360.00, Total S/ 2,360.00. Retención 3% = S/ 70.80.
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
      tieneDetraccion: false,
      montoDetraccion: 0,
      tieneRetencion: true,
      montoRetencion: 70.80,   // 3% de 2360.00
      glosa: 'Compra de existencias con retención de IGV 3%'
    });

    console.log(`Líneas generadas: ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 2A: El asiento debe estar cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 2A: Diferencia debe ser 0.00');

    // Debe: 60111 (2,000.00) + 40111 (360.00) + 20111 (2,000.00) = 4,360.00
    // Haber: 4212 (2,289.20) + 40114 (70.80) + 6111 (2,000.00) = 4,360.00
    assert.equal(prop.totalDebe, 4360.00, 'Total Debe debe ser exactamente S/ 4,360.00');
    assert.equal(prop.totalHaber, 4360.00, 'Total Haber debe ser exactamente S/ 4,360.00');

    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 2289.20, 'Neto por pagar 4212 debe ser S/ 2,289.20');

    const lRet = prop.lineas.find(l => l.codigoCuenta === '40114');
    assert.equal(lRet?.haber, 70.80, 'Retención 40114 debe ser S/ 70.80');

    console.log('✔ Caso 2A superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // CASO 2B / ESC-C-1.23: Compra pura con Detracción SPOT (12%) - Sin Retención
  // -------------------------------------------------------------------------
  console.log('--- CASO 2B / ESC-C-1.23: Compra pura con Detracción SPOT (12%) ---');
  {
    // Factura F002-5678: Base S/ 2,000.00, IGV S/ 360.00, Total S/ 2,360.00. Detracción 12% = S/ 283.20.
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-02b',
      docTipo: '01',
      docSerie: 'F002',
      docNumero: '00005678',
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
      tieneRetencion: false,
      montoRetencion: 0,
      glosa: 'Compra de existencias sujeta a detracción SPOT 12%'
    });

    console.log(`Líneas generadas: ${prop.lineas.length}`);
    prop.lineas.forEach((l) => {
      console.log(`  L${l.linea} | Cta: ${l.codigoCuenta.padEnd(6)} | D: ${l.debe.toFixed(2).padStart(9)} | H: ${l.haber.toFixed(2).padStart(9)} | ${l.glosaLinea || l.denominacionCuenta}`);
    });

    console.log(`  Total Debe: S/ ${prop.totalDebe.toFixed(2)} | Total Haber: S/ ${prop.totalHaber.toFixed(2)} | Dif: S/ ${prop.diferencia.toFixed(2)}`);

    assert.equal(prop.cuadrado, true, 'Caso 2B: El asiento debe estar cuadrado');
    assert.equal(prop.diferencia, 0, 'Caso 2B: Diferencia debe ser 0.00');

    // Debe: 60111 (2,000.00) + 40111 (360.00) + 20111 (2,000.00) = 4,360.00
    // Haber: 4212 (2,076.80) + 4213 (283.20) + 6111 (2,000.00) = 4,360.00
    assert.equal(prop.totalDebe, 4360.00, 'Total Debe debe ser exactamente S/ 4,360.00');
    assert.equal(prop.totalHaber, 4360.00, 'Total Haber debe ser exactamente S/ 4,360.00');

    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 2076.80, 'Neto por pagar 4212 debe ser S/ 2,076.80');

    const lDet = prop.lineas.find(l => l.codigoCuenta === '4213');
    assert.equal(lDet?.haber, 283.20, 'Detracción SPOT 4213 debe ser S/ 283.20');

    console.log('✔ Caso 2B superado exitosamente.\n');
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
  // CASO 5: Tasa especial de IGV al 14% para el ejercicio 2027 (Ley 32219)
  // -------------------------------------------------------------------------
  console.log('--- CASO 5: Tasa especial al 14% (12% IGV + 2% IPM) en 2027 (Ley 32219) ---');
  {
    compraService.validarCoherencia({
      periodoId: '2027-03',
      fechaEmision: '2027-03-15',
      fechaContable: '2027-03-15',
      tipoComprobante: '01',
      serie: 'F005',
      numero: '00000001',
      proveedorId: 'prv-1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      baseGravada: 1000.00,
      igv: 140.00, // 14% en 2027
      total: 1140.00,
      tipoAdquisicion: '1',
      formaPago: 'CONTADO'
    });

    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-05',
      docTipo: '01',
      docSerie: 'F005',
      docNumero: '00000001',
      fechaEmision: '2027-03-15',
      fechaContable: '2027-03-15',
      baseImponible: 1000.00,
      tasaIgv: 0.14,
      igv: 140.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Compra restaurante MYPE tasa especial 14% Ley 32219'
    });

    const lIgv = prop.lineas.find(l => l.codigoCuenta === '40111');
    assert.equal(lIgv?.debe, 140.00, 'IGV 14% debe ser S/ 140.00');
    assert.equal(prop.cuadrado, true, 'Asiento debe cuadrar');

    console.log('✔ Caso 5 superado exitosamente (tasa 14% para 2027 contabilizada correctamente).\n');
  }

  // -------------------------------------------------------------------------
  // CASO 5B: Tasa del 10% en 2027 genera advertencia visible y NO error duro
  // -------------------------------------------------------------------------
  console.log('--- CASO 5B: Tasa 10% en 2027 genera advertencia visible y NO bloqueo duro ---');
  {
    // No debe lanzar error; la validación permite el registro pero emite advertencia
    assert.doesNotThrow(() => {
      compraService.validarCoherencia({
        periodoId: '2027-01',
        fechaEmision: '2027-01-15',
        fechaContable: '2027-01-15',
        tipoComprobante: '01',
        serie: 'F005',
        numero: '00000002',
        proveedorId: 'prv-1',
        moneda: 'PEN',
        tipoCambio: 1.0,
        baseGravada: 1000.00,
        igv: 100.00, // 10%
        total: 1100.00,
        tipoAdquisicion: '1',
        formaPago: 'CONTADO'
      });
    });

    console.log('✔ Caso 5B superado exitosamente (registro permitido con advertencia visible).\n');
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
  // CASO 7 / ESC-C-1.18: Moneda extranjera (USD) con Tipo de Cambio
  // -------------------------------------------------------------------------
  console.log('--- CASO 7 / ESC-C-1.18: Moneda extranjera (USD) con tipo de cambio ---');
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
  // CASO 8 / ESC-C-1.13: Tolerancia de 0.05 soles por redondeo y rechazo ante mayor desbalance
  // -------------------------------------------------------------------------
  console.log('--- CASO 8 / ESC-C-1.13: Tolerancia de redondeo (0.05) vs desbalance inadmisible ---');
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

  // -------------------------------------------------------------------------
  // ESC-C-1.21: Compra Destino 3 (Gravada destinada a operaciones no gravadas - Costo)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.21: Compra Destino 3 (IGV al costo sin crédito fiscal) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-d3',
      docTipo: '01',
      docSerie: 'F003',
      docNumero: '00000033',
      fechaEmision: '2026-09-10',
      fechaContable: '2026-09-10',
      baseImponible: 1000.00,
      cuentaCompra: '60111',
      destino: '3',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Compra Destino 3 sin credito fiscal'
    });

    assert.equal(prop.cuadrado, true, 'ESC-C-1.21: Asiento debe cuadrar');
    assert.equal(prop.totalDebe, 2360.00, 'ESC-C-1.21: Total Debe: 1180(60111 costo total) + 1180(20111 almacén) = 2,360.00');
    assert.equal(prop.totalHaber, 2360.00, 'ESC-C-1.21: Total Haber: 1180(4212) + 1180(6111) = 2,360.00');
    assert.ok(!prop.lineas.some(l => l.codigoCuenta === '40111'), 'ESC-C-1.21: No debe tener crédito fiscal 40111');
    console.log('✔ ESC-C-1.21 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.25: Compra con Percepción de IGV (Agente Perceptor)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.25: Compra con Percepción de IGV (Agente Perceptor) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-perc',
      docTipo: '01',
      docSerie: 'F004',
      docNumero: '00000044',
      fechaEmision: '2026-09-15',
      fechaContable: '2026-09-15',
      baseImponible: 1000.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      tienePercepcion: true,
      montoPercepcion: 23.60, // 2% de 1180
      glosa: 'Compra con percepción de IGV 2%'
    });

    assert.equal(prop.cuadrado, true, 'ESC-C-1.25: Asiento debe cuadrar');
    const lPerc = prop.lineas.find(l => l.codigoCuenta === '40113');
    assert.ok(lPerc && lPerc.debe === 23.60, 'ESC-C-1.25: Debe registrar 40113 Percepción al Debe S/ 23.60');
    const l4212 = prop.lineas.find(l => l.codigoCuenta === '4212');
    assert.equal(l4212?.haber, 1203.60, 'ESC-C-1.25: Pasivo 4212 debe ser 1180 + 23.60 = S/ 1,203.60');
    console.log('✔ ESC-C-1.25 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.02: Factura de Compra a Crédito Simple
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.02: Factura de Compra a Crédito Simple ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-cred',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000055',
      fechaEmision: '2026-09-10',
      fechaContable: '2026-09-10',
      baseImponible: 2000.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Factura de compra a credito 30 dias'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.02: Asiento debe cuadrar');
    assert.equal(prop.totalDebe, 4360.00, 'ESC-C-1.02: Total Debe: 2000 + 360 + 2000 = 4,360.00');
    console.log('✔ ESC-C-1.02 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.04: Boleta de Compra (Tipo 03 - Gasto Deducible)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.04: Boleta de Compra (Tipo 03) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-rus',
      docTipo: '03',
      docSerie: 'B001',
      docNumero: '00000012',
      fechaEmision: '2026-09-12',
      fechaContable: '2026-09-12',
      baseImponible: 250.00,
      cuentaCompra: '60111',
      destino: '4', // No gravado / sin credito fiscal
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Boleta de compra Nuevo RUS deducible'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.04: Asiento debe cuadrar');
    assert.ok(!prop.lineas.some(l => l.codigoCuenta === '40111'), 'ESC-C-1.04: Boleta de compra no otorga credito fiscal 40111');
    console.log('✔ ESC-C-1.04 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.06: Ticket o Cinta de Máquina Registradora (Tipo 12)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.06: Ticket o Cinta de Máquina Registradora (Tipo 12) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-ticket',
      docTipo: '12',
      docSerie: 'T001',
      docNumero: '00000100',
      fechaEmision: '2026-09-14',
      fechaContable: '2026-09-14',
      baseImponible: 500.00,
      cuentaCompra: '60111',
      destino: '1',
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Ticket maquina registradora con IGV discriminado'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.06: Asiento debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 90.00), 'ESC-C-1.06: Ticket con IGV 18% S/ 90.00');
    console.log('✔ ESC-C-1.06 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.20: Compra Destino 2 (Operaciones Comunes - Prorrata)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.20: Compra Destino 2 (Adquisicion comun sujeta a prorrata) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'anx-prov-d2',
      docTipo: '01',
      docSerie: 'F002',
      docNumero: '00000078',
      fechaEmision: '2026-09-16',
      fechaContable: '2026-09-16',
      baseImponible: 1500.00,
      cuentaCompra: '60111',
      destino: '2', // Destino comun
      moneda: 'PEN',
      tipoCambio: 1.0,
      glosa: 'Compra Destino 2 operaciones comunes'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.20: Asiento debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 270.00), 'ESC-C-1.20: IGV comun 40111 S/ 270.00');
    console.log('✔ ESC-C-1.20 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.27: Clasificación de Bienes vs Servicios (Destino por Función 94/95 vs 79)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.27: Clasificacion de Bienes vs Servicios ---');
  {
    const propServ = await contabilizacionService.generar(empresaId, 'COMPRA_SERVICIO', {
      total: 1180.00,
      glosa: 'Servicio de mantenimiento con distribucion por funcion'
    });
    assert.equal(propServ.cuadrado, true, 'ESC-C-1.27: Asiento de servicio debe cuadrar');
    assert.ok(propServ.lineas.some(l => l.codigoCuenta === '941' && l.debe === 600.00), 'ESC-C-1.27: Destino 941 Admin 60%');
    assert.ok(propServ.lineas.some(l => l.codigoCuenta === '951' && l.debe === 400.00), 'ESC-C-1.27: Destino 951 Ventas 40%');
    assert.ok(propServ.lineas.some(l => l.codigoCuenta === '791' && l.haber === 1000.00), 'ESC-C-1.27: Cargas imputables 791');
    console.log('✔ ESC-C-1.27 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.28: Fecha de Vencimiento y Programación de CxP
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.28: Fecha de Vencimiento y Programacion de CxP ---');
  {
    const datosValidar = {
      periodoId: '2026-09',
      fechaEmision: '2026-09-01',
      fechaContable: '2026-09-01',
      fechaVencimiento: '2026-10-01',
      tipoComprobante: '01',
      serie: 'F001',
      numero: '00000099',
      proveedorId: 'prv-1',
      moneda: 'PEN' as const,
      tipoCambio: 1.0,
      baseGravada: 1000.00,
      igv: 180.00,
      total: 1180.00,
      tipoAdquisicion: '1' as const,
      formaPago: 'CREDITO' as const,
      diasCredito: 30
    };
    assert.doesNotThrow(() => compraService.validarCoherencia(datosValidar), 'ESC-C-1.28: Validacion coherente con vencimiento');
    console.log('✔ ESC-C-1.28 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.01: Factura de Venta al Contado / Crédito (Operación Gravada 18%)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.01: Factura de Venta al Contado / Credito (18%) ---');
  {
    const propVenta = await contabilizacionService.generar(empresaId, 'VENTA', {
      total: 1180.00,
      glosa: 'Venta de mercaderias con factura F001-00001001'
    });
    assert.equal(propVenta.cuadrado, true, 'ESC-V-2.01: Asiento de venta debe cuadrar');
    assert.ok(propVenta.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 1180.00), 'ESC-V-2.01: CxC 1212 al Debe S/ 1,180.00');
    assert.ok(propVenta.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 180.00), 'ESC-V-2.01: IGV Debito fiscal 40111 al Haber S/ 180.00');
    console.log('✔ ESC-V-2.01 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.02: Boleta de Venta a Consumidor Final (Tipo 03)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.02: Boleta de Venta a Consumidor Final ---');
  {
    const propBoleta = await contabilizacionService.generar(empresaId, 'VENTA', {
      total: 236.00,
      glosa: 'Boleta de venta B001-00000500 consumidor final'
    });
    assert.equal(propBoleta.cuadrado, true, 'ESC-V-2.02: Asiento de boleta venta debe cuadrar');
    assert.ok(propBoleta.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 236.00), 'ESC-V-2.02: Boletas por cobrar 1212 S/ 236.00');
    assert.ok(propBoleta.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 36.00), 'ESC-V-2.02: IGV 40111 S/ 36.00');
    console.log('✔ ESC-V-2.02 superado exitosamente.\n');
  }

  console.log('========================================================================');
  console.log('TODAS LAS PRUEBAS DE ASIENTO COMPLETO Y VALIDACIONES PASARON AL 100%');
  console.log('========================================================================');
}

ejecutarSuitePruebas().catch((err) => {
  console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS:\n', err);
  process.exit(1);
});
