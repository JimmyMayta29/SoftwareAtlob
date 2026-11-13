process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import assert from 'node:assert/strict';
import { contabilizacionService } from '../services/contabilizacionService';
import { compraService } from '../services/compraService';
import { ventaService } from '../services/ventaService';
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
  // ESC-C-1.03: Compra a Crédito con Cuotas y Fechas de Vencimiento
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.03: Compra a Crédito con Cuotas ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000103',
      fechaEmision: '2026-09-05',
      baseImponible: 1000.00,
      igv: 180.00,
      destino: '1',
      cuotas: [
        { numeroCuota: 1, fechaVencimiento: '2026-10-05', importe: 400.00 },
        { numeroCuota: 2, fechaVencimiento: '2026-11-05', importe: 400.00 },
        { numeroCuota: 3, fechaVencimiento: '2026-12-05', importe: 380.00 }
      ]
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.03: Asiento debe cuadrar');
    assert.equal(prop.totalDebe, 2180.00, 'ESC-C-1.03: Total Debe 2180');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 1180.00), 'ESC-C-1.03: Pasivo 4212 por 1180');
    console.log('✔ ESC-C-1.03 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.05: Liquidación de Compra (Tipo 04 - Sector Primario / Artesanal)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.05: Liquidación de Compra (Tipo 04) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-artesano-1',
      docTipo: '04',
      docSerie: 'L001',
      docNumero: '00000001',
      fechaEmision: '2026-09-10',
      baseImponible: 1000.00,
      igv: 180.00,
      destino: '1',
      tasaRetencionRenta: 0.015
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.05: Asiento liquidación de compra debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40171' && l.haber === 15.00), 'ESC-C-1.05: Retención Renta 1.5% S/ 15.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 180.00), 'ESC-C-1.05: Retención IGV 100% S/ 180.00 al Haber');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 180.00), 'ESC-C-1.05: Crédito fiscal IGV S/ 180.00 al Debe');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 985.00), 'ESC-C-1.05: Neto a pagar al vendedor S/ 985.00');
    console.log('✔ ESC-C-1.05 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.07: Nota de Crédito de Compras (Tipo 07 - Descuento / Devolución)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.07: Nota de Crédito de Compras (Tipo 07) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '07',
      docSerie: 'FC01',
      docNumero: '00000007',
      fechaEmision: '2026-09-12',
      baseImponible: 500.00,
      igv: 90.00,
      destino: '1',
      ajustaInventarioFisico: true
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.07: NC debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.debe === 590.00), 'ESC-C-1.07: Disminución pasivo 4212 al Debe S/ 590');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '60111' && l.haber === 500.00), 'ESC-C-1.07: Ajuste compra 60111 al Haber S/ 500');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 90.00), 'ESC-C-1.07: Ajuste crédito fiscal IGV al Haber S/ 90');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '6111' && l.debe === 500.00), 'ESC-C-1.07: Ajuste variación existencias 6111 Debe S/ 500');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '20111' && l.haber === 500.00), 'ESC-C-1.07: Descargo almacén 20111 Haber S/ 500');
    console.log('✔ ESC-C-1.07 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.08: Nota de Débito de Compras (Tipo 08 - Intereses / Penalidades)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.08: Nota de Débito de Compras (Tipo 08) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '08',
      docSerie: 'FD01',
      docNumero: '00000008',
      fechaEmision: '2026-09-14',
      baseImponible: 200.00,
      igv: 36.00,
      destino: '1',
      motivoNcNd: 'INTERESES'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.08: ND debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '67311' && l.debe === 200.00), 'ESC-C-1.08: Intereses 67311 al Debe S/ 200');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 36.00), 'ESC-C-1.08: IGV adicional 40111 Debe S/ 36');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 236.00), 'ESC-C-1.08: Incremento obligación 4212 Haber S/ 236');
    console.log('✔ ESC-C-1.08 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.09: Importación con DUA / DAM (Tipo 50)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.09: Importación con DUA / DAM (Tipo 50) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'aduanas-sunat-1',
      docTipo: '50',
      docSerie: '118',
      docNumero: '2026-000109',
      fechaEmision: '2026-09-15',
      baseImponible: 5000.00,
      valorCif: 5000.00,
      adValorem: 300.00,
      igvAduanero: 954.00,
      percepcionAduanera: 185.64,
      destino: '1'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.09: DUA debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '60111' && l.debe === 5300.00), 'ESC-C-1.09: Costo CIF + Arancel 60111 Debe S/ 5,300');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 954.00), 'ESC-C-1.09: IGV aduanero 40111 Debe S/ 954');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40113' && l.debe === 185.64), 'ESC-C-1.09: Percepción aduanera 40113 Debe S/ 185.64');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '20111' && l.debe === 5300.00), 'ESC-C-1.09: Almacén existencias 20111 Debe S/ 5,300');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 6439.64), 'ESC-C-1.09: Pasivo liquidación DUA 4212 Haber S/ 6,439.64');
    console.log('✔ ESC-C-1.09 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.10: Factura de No Domiciliados (Invoice Exterior Tipo 91)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.10: Invoice No Domiciliados (Tipo 91) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-ext-usa',
      docTipo: '91',
      docSerie: 'INV',
      docNumero: '2026-9101',
      fechaEmision: '2026-09-18',
      baseImponible: 2000.00,
      destino: '1',
      tasaRetencionNoDomiciliado: 0.30,
      cuentaCompra: '63211'
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.10: Invoice exterior debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '63211' && l.debe === 2000.00), 'ESC-C-1.10: Gasto servicios exterior 63211 Debe S/ 2,000');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 360.00), 'ESC-C-1.10: Crédito IGV utilización 40111 Debe S/ 360');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '941' && l.debe === 1200.00), 'ESC-C-1.10: Destino administración 941 Debe S/ 1,200');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '951' && l.debe === 800.00), 'ESC-C-1.10: Destino ventas 951 Debe S/ 800');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 1400.00), 'ESC-C-1.10: Neto exterior 4212 Haber S/ 1,400');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40174' && l.haber === 600.00), 'ESC-C-1.10: Retención Renta ND 40174 Haber S/ 600');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40112' && l.haber === 360.00), 'ESC-C-1.10: IGV utilización 40112 Haber S/ 360');
    console.log('✔ ESC-C-1.10 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.11: Descuentos Comerciales en Factura vs Fuera de Factura
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.11: Descuentos Comerciales Fuera de Factura ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '07',
      docSerie: 'FC01',
      docNumero: '00000011',
      fechaEmision: '2026-09-20',
      baseImponible: 300.00,
      igv: 54.00,
      destino: '1',
      cuentaDescuentoNc: '7311',
      ajustaInventarioFisico: false
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.11: NC descuento comercial debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '4212' && l.debe === 354.00), 'ESC-C-1.11: Pasivo 4212 Debe S/ 354');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '7311' && l.haber === 300.00), 'ESC-C-1.11: Descuentos obtenidos 7311 Haber S/ 300');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 54.00), 'ESC-C-1.11: Ajuste IGV 40111 Haber S/ 54');
    console.log('✔ ESC-C-1.11 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.12: Anticipos Otorgados a Proveedores y su Aplicación
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.12: Anticipos Otorgados y Aplicación ---');
  {
    // Parte 1: Comprobante de anticipo otorgado
    const propAnt = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '01',
      docSerie: 'FA01',
      docNumero: '00000001',
      fechaEmision: '2026-09-02',
      baseImponible: 1000.00,
      igv: 180.00,
      destino: '1',
      esAnticipo: true
    });
    assert.equal(propAnt.cuadrado, true, 'ESC-C-1.12: Asiento anticipo debe cuadrar');
    assert.ok(propAnt.lineas.some(l => l.codigoCuenta === '422' && l.debe === 1000.00), 'ESC-C-1.12: Anticipos a proveedores 422 Debe S/ 1,000');
    assert.ok(propAnt.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 180.00), 'ESC-C-1.12: Crédito fiscal anticipo 40111 Debe S/ 180');
    assert.ok(propAnt.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 1180.00), 'ESC-C-1.12: Obligación anticipo 4212 Haber S/ 1,180');

    // Parte 2: Factura definitiva con aplicación del anticipo
    const propFact = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000112',
      fechaEmision: '2026-09-22',
      baseImponible: 3000.00,
      igv: 540.00,
      destino: '1',
      montoAnticipoAplicado: 1000.00
    });
    assert.equal(propFact.cuadrado, true, 'ESC-C-1.12: Factura definitiva con aplicación anticipo debe cuadrar');
    assert.ok(propFact.lineas.some(l => l.codigoCuenta === '60111' && l.debe === 3000.00), 'ESC-C-1.12: Costo compra 60111 Debe S/ 3,000');
    assert.ok(propFact.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 540.00), 'ESC-C-1.12: IGV 40111 Debe S/ 540');
    assert.ok(propFact.lineas.some(l => l.codigoCuenta === '422' && l.haber === 1000.00), 'ESC-C-1.12: Aplicación anticipo 422 Haber S/ 1,000');
    assert.ok(propFact.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 2540.00), 'ESC-C-1.12: Saldo neto por pagar 4212 Haber S/ 2,540');
    console.log('✔ ESC-C-1.12 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-C-1.17: Adquisiciones a Título Gratuito (Bonificaciones Comerciales)
  // -------------------------------------------------------------------------
  console.log('--- ESC-C-1.17: Adquisición a Título Gratuito (Bonificación) ---');
  {
    const prop = await contabilizacionService.generarAsientoCompraAutomatizada(empresaId, {
      proveedorId: 'prv-01',
      docTipo: '01',
      docSerie: 'FB01',
      docNumero: '00000017',
      fechaEmision: '2026-09-25',
      baseImponible: 0.00,
      destino: '1',
      esGratuito: true,
      valorReferencial: 800.00
    });
    assert.equal(prop.cuadrado, true, 'ESC-C-1.17: Bonificación comercial debe cuadrar');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '20111' && l.debe === 800.00), 'ESC-C-1.17: Almacén 20111 Debe S/ 800');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '7311' && l.haber === 800.00), 'ESC-C-1.17: Descuentos y bonificaciones obtenidos 7311 Haber S/ 800');
    console.log('✔ ESC-C-1.17 superado exitosamente.\n');
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

  // -------------------------------------------------------------------------
  // ESC-V-2.03: Venta con Costo de Ventas en Inventario Permanente (69 vs 20)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.03: Venta con Costo de Ventas en Inventario Permanente ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-01',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000001',
      fechaEmision: '2026-09-02',
      baseImponible: 1000.00,
      igv: 180.00,
      costoVenta: 600.00
    });
    // ESC-V-2.03: Validar cuadre, débito 1212, crédito 40111, crédito 70121, costo 69121 y almacén 20111
    assert.equal(prop.cuadrado, true, 'ESC-V-2.03: Asiento debe cuadrar');
    assert.equal(prop.totalDebe, 1780.00, 'ESC-V-2.03: Total Debe S/ 1,780.00');
    assert.equal(prop.totalHaber, 1780.00, 'ESC-V-2.03: Total Haber S/ 1,780.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 1180.00), 'ESC-V-2.03: CxC 1212 al Debe S/ 1,180.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 180.00), 'ESC-V-2.03: IGV 40111 al Haber S/ 180.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70121' && l.haber === 1000.00), 'ESC-V-2.03: Venta local 70121 al Haber S/ 1,000.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '69121' && l.debe === 600.00), 'ESC-V-2.03: Costo de ventas 69121 al Debe S/ 600.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '20111' && l.haber === 600.00), 'ESC-V-2.03: Descargo almacén 20111 al Haber S/ 600.00');
    console.log('✔ ESC-V-2.03 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.04: Venta Exonerada del IGV (Apéndice I y II)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.04: Venta Exonerada del IGV (Apéndice I y II) ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-02',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000002',
      fechaEmision: '2026-09-03',
      baseImponible: 0,
      baseExonerada: 800.00,
      igv: 0.00
    });
    // ESC-V-2.04: Venta exonerada debe abonarse en la subcuenta analítica 70122 sin IGV
    assert.equal(prop.cuadrado, true, 'ESC-V-2.04: Asiento exonerado debe cuadrar');
    assert.equal(prop.totalDebe, 800.00, 'ESC-V-2.04: Total Debe S/ 800.00');
    assert.equal(prop.totalHaber, 800.00, 'ESC-V-2.04: Total Haber S/ 800.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 800.00), 'ESC-V-2.04: CxC 1212 al Debe S/ 800.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70122' && l.haber === 800.00), 'ESC-V-2.04: Venta exonerada 70122 al Haber S/ 800.00');
    assert.ok(!prop.lineas.some(l => l.codigoCuenta === '40111'), 'ESC-V-2.04: No debe generar cuenta de IGV');
    console.log('✔ ESC-V-2.04 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.05: Venta Inafecta del IGV (Operaciones No Gravadas)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.05: Venta Inafecta del IGV (Operaciones No Gravadas) ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-03',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000003',
      fechaEmision: '2026-09-04',
      baseImponible: 0,
      baseInafecta: 500.00,
      igv: 0.00
    });
    // ESC-V-2.05: Operación inafecta acreditada en la subcuenta 70123 sin débito fiscal
    assert.equal(prop.cuadrado, true, 'ESC-V-2.05: Asiento inafecto debe cuadrar');
    assert.equal(prop.totalDebe, 500.00, 'ESC-V-2.05: Total Debe S/ 500.00');
    assert.equal(prop.totalHaber, 500.00, 'ESC-V-2.05: Total Haber S/ 500.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 500.00), 'ESC-V-2.05: CxC 1212 al Debe S/ 500.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70123' && l.haber === 500.00), 'ESC-V-2.05: Venta inafecta 70123 al Haber S/ 500.00');
    console.log('✔ ESC-V-2.05 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.06: Exportación de Bienes / Servicios (Facturas E001 / Tipo 01)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.06: Exportación de Bienes / Servicios ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-ext',
      docTipo: '01',
      docSerie: 'E001',
      docNumero: '00000001',
      fechaEmision: '2026-09-05',
      baseImponible: 0,
      baseExportacion: 5000.00,
      igv: 0.00
    });
    // ESC-V-2.06: Factura de exportación con ingreso acreditado en 70111 sin IGV
    assert.equal(prop.cuadrado, true, 'ESC-V-2.06: Asiento de exportación debe cuadrar');
    assert.equal(prop.totalDebe, 5000.00, 'ESC-V-2.06: Total Debe S/ 5,000.00');
    assert.equal(prop.totalHaber, 5000.00, 'ESC-V-2.06: Total Haber S/ 5,000.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 5000.00), 'ESC-V-2.06: CxC 1212 al Debe S/ 5,000.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70111' && l.haber === 5000.00), 'ESC-V-2.06: Venta exportación 70111 al Haber S/ 5,000.00');
    console.log('✔ ESC-V-2.06 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.07: Venta sujeta a Detracción SPOT (Cliente deposita al BN)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.07: Venta sujeta a Detracción SPOT ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-spot',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000050',
      fechaEmision: '2026-09-06',
      baseImponible: 2000.00,
      igv: 360.00,
      tieneDetraccion: true,
      montoDetraccion: 283.20,
      codigoDetraccion: '022'
    });
    // ESC-V-2.07: Desglose analítico entre saldo comercial 12121 y SPOT por cobrar 12122
    assert.equal(prop.cuadrado, true, 'ESC-V-2.07: Asiento con detracción debe cuadrar');
    assert.equal(prop.totalDebe, 2360.00, 'ESC-V-2.07: Total Debe S/ 2,360.00');
    assert.equal(prop.totalHaber, 2360.00, 'ESC-V-2.07: Total Haber S/ 2,360.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '12121' && l.debe === 2076.80), 'ESC-V-2.07: Neto cliente 12121 al Debe S/ 2,076.80');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '12122' && l.debe === 283.20), 'ESC-V-2.07: SPOT Banco de la Nación 12122 al Debe S/ 283.20');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 360.00), 'ESC-V-2.07: IGV 40111 al Haber S/ 360.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70121' && l.haber === 2000.00), 'ESC-V-2.07: Venta local 70121 al Haber S/ 2,000.00');
    console.log('✔ ESC-V-2.07 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.08: Venta con Percepción de IGV Cobrada al Cliente
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.08: Venta con Percepción de IGV Cobrada al Cliente ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-perc',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000060',
      fechaEmision: '2026-09-07',
      baseImponible: 1000.00,
      igv: 180.00,
      tienePercepcion: true,
      montoPercepcion: 23.60,
      porcentajePercepcion: 2.0
    });
    // ESC-V-2.08: Pasivo 40113 al Haber por la percepción cobrada y total incrementado en 1212 al Debe
    assert.equal(prop.cuadrado, true, 'ESC-V-2.08: Asiento con percepción debe cuadrar');
    assert.equal(prop.totalDebe, 1203.60, 'ESC-V-2.08: Total Debe S/ 1,203.60');
    assert.equal(prop.totalHaber, 1203.60, 'ESC-V-2.08: Total Haber S/ 1,203.60');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 1203.60), 'ESC-V-2.08: CxC total con percepción 1212 al Debe S/ 1,203.60');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 180.00), 'ESC-V-2.08: Débito fiscal IGV 40111 al Haber S/ 180.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40113' && l.haber === 23.60), 'ESC-V-2.08: Percepción por pagar 40113 al Haber S/ 23.60');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70121' && l.haber === 1000.00), 'ESC-V-2.08: Venta local 70121 al Haber S/ 1,000.00');
    console.log('✔ ESC-V-2.08 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.09: Venta con Tributos Adicionales (ISC / ICBPER / Otros)
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.09: Venta con Tributos Adicionales (ISC / ICBPER) ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-trib',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000070',
      fechaEmision: '2026-09-08',
      baseImponible: 1000.00,
      igv: 180.00,
      isc: 50.00,
      icbper: 2.00
    });
    // ESC-V-2.09: Registro de pasivos por ISC en 40121 e ICBPER en 401891 al Haber
    assert.equal(prop.cuadrado, true, 'ESC-V-2.09: Asiento con ISC/ICBPER debe cuadrar');
    assert.equal(prop.totalDebe, 1232.00, 'ESC-V-2.09: Total Debe S/ 1,232.00');
    assert.equal(prop.totalHaber, 1232.00, 'ESC-V-2.09: Total Haber S/ 1,232.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 1232.00), 'ESC-V-2.09: CxC 1212 al Debe S/ 1,232.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 180.00), 'ESC-V-2.09: IGV 40111 al Haber S/ 180.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '40121' && l.haber === 50.00), 'ESC-V-2.09: ISC por pagar 40121 al Haber S/ 50.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '401891' && l.haber === 2.00), 'ESC-V-2.09: ICBPER por pagar 401891 al Haber S/ 2.00');
    assert.ok(prop.lineas.some(l => l.codigoCuenta === '70121' && l.haber === 1000.00), 'ESC-V-2.09: Venta local 70121 al Haber S/ 1,000.00');
    console.log('✔ ESC-V-2.09 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.10: Venta en Moneda Extranjera (USD) con Tipo de Cambio Compra SUNAT
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.10: Venta en Moneda Extranjera (USD) ---');
  {
    const prop = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-usd',
      docTipo: '01',
      docSerie: 'F001',
      docNumero: '00000080',
      fechaEmision: '2026-09-09',
      baseImponible: 1000.00,
      igv: 180.00,
      moneda: 'USD',
      tipoCambio: 3.750
    });
    // ESC-V-2.10: Registro en PEN al tipo de cambio con importes en ME reflejados en debeMe/haberMe
    assert.equal(prop.cuadrado, true, 'ESC-V-2.10: Asiento USD en PEN debe cuadrar');
    assert.equal(prop.totalDebe, 4425.00, 'ESC-V-2.10: Total Debe PEN S/ 4,425.00 (USD 1,180 * 3.75)');
    assert.equal(prop.totalHaber, 4425.00, 'ESC-V-2.10: Total Haber PEN S/ 4,425.00');
    const lineaCliente = prop.lineas.find(l => l.codigoCuenta === '1212');
    assert.ok(lineaCliente, 'ESC-V-2.10: Línea cliente 1212 existe');
    assert.equal(lineaCliente.debe, 4425.00, 'ESC-V-2.10: Debe PEN 4,425.00');
    assert.equal(lineaCliente.debeMe, 1180.00, 'ESC-V-2.10: Debe ME USD 1,180.00');
    const lineaIgv = prop.lineas.find(l => l.codigoCuenta === '40111');
    assert.ok(lineaIgv, 'ESC-V-2.10: Línea IGV 40111 existe');
    assert.equal(lineaIgv.haber, 675.00, 'ESC-V-2.10: Haber PEN 675.00 (USD 180 * 3.75)');
    assert.equal(lineaIgv.haberMe, 180.00, 'ESC-V-2.10: Haber ME USD 180.00');
    console.log('✔ ESC-V-2.10 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-V-2.11: Nota de Crédito y Nota de Débito de Ventas
  // -------------------------------------------------------------------------
  console.log('--- ESC-V-2.11: Nota de Crédito y Nota de Débito de Ventas ---');
  {
    // Subcaso 1: NC con reversa de ingreso y reingreso al almacén
    const propNC = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-nc',
      docTipo: '07',
      docSerie: 'FC01',
      docNumero: '00000010',
      fechaEmision: '2026-09-10',
      baseImponible: 1000.00,
      igv: 180.00,
      costoVenta: 500.00
    });
    // ESC-V-2.11: NC anulación debita 70121 y 40111, acredita 1212, y reingresa 20111 contra 69121
    assert.equal(propNC.cuadrado, true, 'ESC-V-2.11: Asiento de NC debe cuadrar');
    assert.equal(propNC.totalDebe, 1680.00, 'ESC-V-2.11: Total Debe S/ 1,680.00');
    assert.equal(propNC.totalHaber, 1680.00, 'ESC-V-2.11: Total Haber S/ 1,680.00');
    assert.ok(propNC.lineas.some(l => l.codigoCuenta === '70121' && l.debe === 1000.00), 'ESC-V-2.11: Reversa 70121 al Debe S/ 1,000.00');
    assert.ok(propNC.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 180.00), 'ESC-V-2.11: Ajuste débito 40111 al Debe S/ 180.00');
    assert.ok(propNC.lineas.some(l => l.codigoCuenta === '1212' && l.haber === 1180.00), 'ESC-V-2.11: Disminución CxC 1212 al Haber S/ 1,180.00');
    assert.ok(propNC.lineas.some(l => l.codigoCuenta === '20111' && l.debe === 500.00), 'ESC-V-2.11: Reingreso existencias 20111 al Debe S/ 500.00');
    assert.ok(propNC.lineas.some(l => l.codigoCuenta === '69121' && l.haber === 500.00), 'ESC-V-2.11: Reversa costo 69121 al Haber S/ 500.00');

    // Subcaso 2: NC por descuento concedido fuera de factura (cuenta 7411)
    const propNCDesc = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-nc',
      docTipo: '07',
      docSerie: 'FC01',
      docNumero: '00000011',
      fechaEmision: '2026-09-11',
      baseImponible: 200.00,
      igv: 36.00,
      descuentoFueraFactura: 200.00
    });
    assert.equal(propNCDesc.cuadrado, true, 'ESC-V-2.11: Asiento NC descuento debe cuadrar');
    assert.ok(propNCDesc.lineas.some(l => l.codigoCuenta === '7411' && l.debe === 200.00), 'ESC-V-2.11: Descuento 7411 al Debe S/ 200.00');
    assert.ok(propNCDesc.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 36.00), 'ESC-V-2.11: Ajuste IGV 40111 al Debe S/ 36.00');
    assert.ok(propNCDesc.lineas.some(l => l.codigoCuenta === '1212' && l.haber === 236.00), 'ESC-V-2.11: Disminución CxC 1212 al Haber S/ 236.00');

    // Subcaso 3: ND por intereses de mora (cuenta 7721)
    const propND = await contabilizacionService.generarAsientoVentaAutomatizada(empresaId, {
      clienteId: 'anx-cli-nd',
      docTipo: '08',
      docSerie: 'FD01',
      docNumero: '00000005',
      fechaEmision: '2026-09-12',
      baseImponible: 100.00,
      igv: 18.00,
      motivoNota: 'INTERESES_MORA'
    });
    assert.equal(propND.cuadrado, true, 'ESC-V-2.11: Asiento ND intereses debe cuadrar');
    assert.ok(propND.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 118.00), 'ESC-V-2.11: Incremento CxC 1212 al Debe S/ 118.00');
    assert.ok(propND.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 18.00), 'ESC-V-2.11: IGV 40111 al Haber S/ 18.00');
    assert.ok(propND.lineas.some(l => l.codigoCuenta === '7721' && l.haber === 100.00), 'ESC-V-2.11: Intereses comerciales 7721 al Haber S/ 100.00');
    console.log('✔ ESC-V-2.11 superado exitosamente.\n');
  }

  // Validación tributaria cruzada: Bloqueo de Percepción + Retención en Ventas
  {
    assert.throws(() => {
      ventaService.validarCoherencia({
        periodoId: 'per-2026-09',
        fechaEmision: '2026-09-13',
        fechaContable: '2026-09-13',
        tipoComprobante: '01',
        serie: 'F001',
        numero: '00000099',
        clienteId: 'anx-cli-bloq',
        baseGravada: 1000.00,
        igv: 180.00,
        total: 1180.00,
        tienePercepcion: true,
        montoPercepcion: 23.60,
        tieneRetencion: true,
        montoRetencion: 35.40
      });
    }, /COMBINACION_TRIBUTARIA_BLOQUEADA/);
    console.log('✔ Validación tributaria: Bloqueo de Percepción + Retención en ventas verificado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-COB-3.04: Cobro con Cheque de Cliente en Cartera y Posterior Depósito
  // -------------------------------------------------------------------------
  console.log('--- ESC-COB-3.04: Cobro con Cheque en Cartera (1031) y Depósito Bancario (10411/1031) ---');
  {
    // Fase 1: Recepción de cheque de cliente en cartera (1031 / 1212)
    const cobroCheque = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'COBRANZA',
      monto: 3500.00,
      esCheque: true,
      glosa: 'Cobro de factura con cheque en cartera BCP N° 849201',
      anexoId: 'cli-001'
    });
    assert.equal(cobroCheque.cuadrado, true, 'ESC-COB-3.04: Recepción de cheque debe cuadrar');
    assert.ok(cobroCheque.lineas.some(l => l.codigoCuenta === '1031' && l.debe === 3500.00), 'ESC-COB-3.04: Debe 1031 Cheques en cartera S/ 3,500.00');
    assert.ok(cobroCheque.lineas.some(l => l.codigoCuenta === '1212' && l.haber === 3500.00), 'ESC-COB-3.04: Haber 1212 Facturas por cobrar S/ 3,500.00');

    // Fase 2: Depósito bancario del cheque en cuenta corriente (10411 / 1031)
    const depositoCheque = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'COBRANZA',
      monto: 3500.00,
      esDepositoCheque: true,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Depósito en cuenta BCP de cheque N° 849201'
    });
    assert.equal(depositoCheque.cuadrado, true, 'ESC-COB-3.04: Depósito de cheque debe cuadrar');
    assert.ok(depositoCheque.lineas.some(l => l.codigoCuenta === '10411' && l.debe === 3500.00), 'ESC-COB-3.04: Debe 10411 Bancos Cta Cte S/ 3,500.00');
    assert.ok(depositoCheque.lineas.some(l => l.codigoCuenta === '1031' && l.haber === 3500.00), 'ESC-COB-3.04: Haber 1031 Cheques en cartera descargados S/ 3,500.00');
    console.log('✔ ESC-COB-3.04 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-COB-3.05: Cobro de Anticipos de Clientes sin Factura Definitiva
  // -------------------------------------------------------------------------
  console.log('--- ESC-COB-3.05: Cobro de Anticipo de Clientes (10411 / 1221) ---');
  {
    const anticipo = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'COBRANZA',
      monto: 5000.00,
      esAnticipo: true,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Anticipo recibido de cliente para fabricación de estructuras',
      anexoId: 'cli-002'
    });
    assert.equal(anticipo.cuadrado, true, 'ESC-COB-3.05: Asiento de anticipo debe cuadrar');
    assert.ok(anticipo.lineas.some(l => l.codigoCuenta === '10411' && l.debe === 5000.00), 'ESC-COB-3.05: Debe 10411 Bancos Cta Cte S/ 5,000.00');
    assert.ok(anticipo.lineas.some(l => l.codigoCuenta === '1221' && l.haber === 5000.00), 'ESC-COB-3.05: Haber 1221 Anticipos de clientes S/ 5,000.00');
    console.log('✔ ESC-COB-3.05 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-COB-3.06: Apertura y Constitución de Fondo Fijo de Caja Chica
  // -------------------------------------------------------------------------
  console.log('--- ESC-COB-3.06: Apertura Fondo Fijo Caja Chica (1021 / 10411) ---');
  {
    const aperturaCaja = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'CAJA_CHICA_APERTURA',
      monto: 1500.00,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Constitución y asignación de fondo fijo caja chica administración'
    });
    assert.equal(aperturaCaja.cuadrado, true, 'ESC-COB-3.06: Asiento apertura caja chica debe cuadrar');
    assert.ok(aperturaCaja.lineas.some(l => l.codigoCuenta === '1021' && l.debe === 1500.00), 'ESC-COB-3.06: Debe 1021 Fondos fijos S/ 1,500.00');
    assert.ok(aperturaCaja.lineas.some(l => l.codigoCuenta === '10411' && l.haber === 1500.00), 'ESC-COB-3.06: Haber 10411 Banco Cta Cte S/ 1,500.00');
    console.log('✔ ESC-COB-3.06 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-PAG-4.02: Pago con Comprobante de Retención Electrónica CRE 3%
  // -------------------------------------------------------------------------
  console.log('--- ESC-PAG-4.02: Pago a Proveedor con Retención Electrónica CRE 3% (4212 / 40114 / 10411) ---');
  {
    const pagoCRE = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'PAGO',
      monto: 2000.00,
      tieneRetencion: true,
      montoRetencion: 60.00,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Pago factura F001-901 con retención CRE R001-15 (3%)',
      anexoId: 'prov-001'
    });
    assert.equal(pagoCRE.cuadrado, true, 'ESC-PAG-4.02: Asiento con retención CRE debe cuadrar');
    assert.equal(pagoCRE.totalDebe, 2000.00, 'ESC-PAG-4.02: Total Debe S/ 2,000.00');
    assert.equal(pagoCRE.totalHaber, 2000.00, 'ESC-PAG-4.02: Total Haber S/ 2,000.00');
    assert.ok(pagoCRE.lineas.some(l => l.codigoCuenta === '4212' && l.debe === 2000.00), 'ESC-PAG-4.02: Debe 4212 Total factura S/ 2,000.00');
    assert.ok(pagoCRE.lineas.some(l => l.codigoCuenta === '40114' && l.haber === 60.00), 'ESC-PAG-4.02: Haber 40114 Retención 3% S/ 60.00');
    assert.ok(pagoCRE.lineas.some(l => l.codigoCuenta === '10411' && l.haber === 1940.00), 'ESC-PAG-4.02: Haber 10411 Neto pagado S/ 1,940.00');
    console.log('✔ ESC-PAG-4.02 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-PAG-4.03: Pago en Efectivo de Compras Menores (Caja Chica)
  // -------------------------------------------------------------------------
  console.log('--- ESC-PAG-4.03: Pago de Compras Menores con Caja Chica (4212 / 1021) ---');
  {
    const pagoCajaChica = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'CAJA_CHICA_PAGO',
      monto: 180.00,
      cuentaContrapartidaCodigo: '4212',
      glosa: 'Pago de útiles y refrigerio menor con fondo de caja chica',
      anexoId: 'prov-libreria'
    });
    assert.equal(pagoCajaChica.cuadrado, true, 'ESC-PAG-4.03: Pago caja chica debe cuadrar');
    assert.ok(pagoCajaChica.lineas.some(l => l.codigoCuenta === '4212' && l.debe === 180.00), 'ESC-PAG-4.03: Debe 4212 Compras menores S/ 180.00');
    assert.ok(pagoCajaChica.lineas.some(l => l.codigoCuenta === '1021' && l.haber === 180.00), 'ESC-PAG-4.03: Haber 1021 Caja chica S/ 180.00');
    console.log('✔ ESC-PAG-4.03 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-PAG-4.07: Rendición y Reembolso / Reposición de Caja Chica
  // -------------------------------------------------------------------------
  console.log('--- ESC-PAG-4.07: Rendición y Reposición de Caja Chica (1021 / 10411) ---');
  {
    const reposicion = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'CAJA_CHICA_REPOSICION',
      monto: 850.00,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Reembolso y reposición de fondo fijo caja chica rendición N° 004-2026'
    });
    assert.equal(reposicion.cuadrado, true, 'ESC-PAG-4.07: Asiento reposición caja chica debe cuadrar');
    assert.ok(reposicion.lineas.some(l => l.codigoCuenta === '1021' && l.debe === 850.00), 'ESC-PAG-4.07: Debe 1021 Reembolso fondo fijo S/ 850.00');
    assert.ok(reposicion.lineas.some(l => l.codigoCuenta === '10411' && l.haber === 850.00), 'ESC-PAG-4.07: Haber 10411 Banco Cta Cte S/ 850.00');
    console.log('✔ ESC-PAG-4.07 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-SPOT-5.02: Depósito de Autodetracción por Venta de Servicios (1071 / 1212)
  // -------------------------------------------------------------------------
  console.log('--- ESC-SPOT-5.02: Autodetracción Abonada en Cuenta BN Titular (1071 / 1212) ---');
  {
    const autodet = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'AUTODETRACCION',
      monto: 480.00,
      glosa: 'Autodetracción 12% por servicios de consultoría Factura F001-1200 constancia BN 778912',
      anexoId: 'cli-003'
    });
    assert.equal(autodet.cuadrado, true, 'ESC-SPOT-5.02: Asiento autodetracción debe cuadrar');
    assert.ok(autodet.lineas.some(l => l.codigoCuenta === '1071' && l.debe === 480.00), 'ESC-SPOT-5.02: Debe 1071 Cuenta Detracciones BN S/ 480.00');
    assert.ok(autodet.lineas.some(l => l.codigoCuenta === '1212' && l.haber === 480.00), 'ESC-SPOT-5.02: Haber 1212 Facturas por cobrar S/ 480.00');
    console.log('✔ ESC-SPOT-5.02 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-SPOT-5.03: Pago de Tributos SUNAT utilizando Fondos de Detracciones SPOT BN
  // -------------------------------------------------------------------------
  console.log('--- ESC-SPOT-5.03: Pago de Tributos con Fondos SPOT BN (40111 / 1071) ---');
  {
    const pagoTribSPOT = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'PAGO_TRIBUTOS_DETRACCION',
      monto: 1250.00,
      cuentaContrapartidaCodigo: '40111',
      glosa: 'Pago IGV período 2026-08 con fondos cuenta de detracciones Banco de la Nación'
    });
    assert.equal(pagoTribSPOT.cuadrado, true, 'ESC-SPOT-5.03: Asiento pago tributos con SPOT debe cuadrar');
    assert.ok(pagoTribSPOT.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 1250.00), 'ESC-SPOT-5.03: Debe 40111 IGV cancelado S/ 1,250.00');
    assert.ok(pagoTribSPOT.lineas.some(l => l.codigoCuenta === '1071' && l.haber === 1250.00), 'ESC-SPOT-5.03: Haber 1071 Fondos restringidos BN S/ 1,250.00');
    console.log('✔ ESC-SPOT-5.03 superado exitosamente.\n');
  }

  // -------------------------------------------------------------------------
  // ESC-SPOT-5.04: Liberación / Extorno de Fondos de Detracciones a Cuenta Comercial
  // -------------------------------------------------------------------------
  console.log('--- ESC-SPOT-5.04: Liberación de Fondos de Detracciones (10411 / 1071) ---');
  {
    const liberacion = await contabilizacionService.generarAsientoTesoreriaAutomatizada(empresaId, {
      tipoOperacionTesoreria: 'LIBERACION_DETRACCION',
      monto: 10000.00,
      cuentaFinancieraCodigo: '10411',
      glosa: 'Liberación de fondos de cuenta de detracciones según Res. Intendencia SUNAT 012-2026'
    });
    assert.equal(liberacion.cuadrado, true, 'ESC-SPOT-5.04: Asiento liberación fondos SPOT debe cuadrar');
    assert.ok(liberacion.lineas.some(l => l.codigoCuenta === '10411' && l.debe === 10000.00), 'ESC-SPOT-5.04: Debe 10411 Banco Cta Cte operativa S/ 10,000.00');
    assert.ok(liberacion.lineas.some(l => l.codigoCuenta === '1071' && l.haber === 10000.00), 'ESC-SPOT-5.04: Haber 1071 Fondos restringidos BN S/ 10,000.00');
    console.log('✔ ESC-SPOT-5.04 superado exitosamente.\n');
  }

  console.log('========================================================================');
  console.log('TODAS LAS PRUEBAS DE ASIENTO COMPLETO Y VALIDACIONES PASARON AL 100%');
  console.log('========================================================================');
}

ejecutarSuitePruebas().catch((err) => {
  console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS:\n', err);
  process.exit(1);
});
