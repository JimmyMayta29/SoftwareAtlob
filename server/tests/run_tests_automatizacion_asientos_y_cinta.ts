process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { contabilizacionService } from '../services/contabilizacionService';
import { consolidacionMensualService, CONSOLIDACIONES_MEMORIA } from '../services/consolidacionMensualService';
import { asientoService, ASIENTOS_MEMORIA } from '../services/asientoService';
import { empresaRepository, EMPRESAS_STORE } from '../repositories/empresaRepository';
import { periodoService, PERIODOS_MEMORIA } from '../services/periodoService';

console.log('--- Ejecutando Pruebas de Automatización de Asientos, Consolidación Mensual y Cinta (Fase 11) ---');

let pruebasPasadas = 0;
const totalPruebas = 9;

async function testRunner() {
  const empresaPruebaId = 'emp-test-auto-01';
  const periodoAbierto = '2026-09';
  const periodoCerrado = '2026-08';
  const userId = 'usr-admin-test';

  // Configurar empresas de prueba en el almacén en memoria
  EMPRESAS_STORE.push(
    {
      id: empresaPruebaId,
      tenantId: 'tenant-test',
      codigoEmpresa: 'TESTAUTO',
      ruc: '20555555551',
      razonSocial: 'EMPRESA AUTOMATIZACION TEST S.A.C.',
      regimenTributario: 'REGIMEN_GENERAL',
      domicilioFiscal: 'AV. PRINCIPAL 100',
      monedaPrincipal: 'PEN',
      metodoInventario: 'PERMANENTE',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'emp-test-sin-metodo',
      tenantId: 'tenant-test',
      codigoEmpresa: 'TESTSINMETODO',
      ruc: '20555555552',
      razonSocial: 'EMPRESA SIN METODO S.A.C.',
      regimenTributario: 'REGIMEN_GENERAL',
      domicilioFiscal: 'AV. SECUNDARIA 200',
      monedaPrincipal: 'PEN',
      metodoInventario: null, // Sin método de inventario
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  );

  // Configurar periodos en memoria
  PERIODOS_MEMORIA.push(
    {
      id: `per-${empresaPruebaId}-${periodoAbierto}`,
      empresaId: empresaPruebaId,
      ejercicioId: 'eje-2026',
      anio: 2026,
      mes: 9,
      codigoPeriodo: periodoAbierto,
      estado: 'ABIERTO',
    },
    {
      id: `per-${empresaPruebaId}-${periodoCerrado}`,
      empresaId: empresaPruebaId,
      ejercicioId: 'eje-2026',
      anio: 2026,
      mes: 8,
      codigoPeriodo: periodoCerrado,
      estado: 'CERRADO',
    }
  );

  // --------------------------------------------------------------------------
  // TEST 1: Compra periódica destino 1: IGV (40111), obligación (4212), costo (6011) sin 20111/6111
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Compra periódica destino 1 (sin traslado 20111 / 6111)');
  await empresaRepository.actualizarMetodoInventario(empresaPruebaId, 'PERIODICO');
  
  const compraPeriodica = await contabilizacionService.generarAsientoCompraAutomatizada(empresaPruebaId, {
    proveedorId: 'anx-prov-01',
    docTipo: '01',
    docSerie: 'F001',
    docNumero: '00000001',
    fechaEmision: '2026-09-10',
    baseImponible: 1000.00,
    cuentaCompra: '6011',
    destino: '1'
  });

  assert.equal(compraPeriodica.cuadrado, true, 'El asiento debe estar cuadrado');
  assert.equal(compraPeriodica.totalDebe, 1180.00, 'Debe total: Base 1000 + IGV 180 = 1180');
  assert.equal(compraPeriodica.totalHaber, 1180.00, 'Haber total: Proveedor 4212 = 1180');
  assert.equal(compraPeriodica.lineas.some(l => (l.codigoCuenta === '6011' || l.codigoCuenta === '60111') && l.debe === 1000), true, 'Línea de compra 60111 al Debe');
  assert.equal(compraPeriodica.lineas.some(l => l.codigoCuenta === '40111' && l.debe === 180), true, 'Línea IGV 40111 al Debe');
  assert.equal(compraPeriodica.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 1180), true, 'Línea 4212 al Haber');
  assert.equal(compraPeriodica.lineas.some(l => l.codigoCuenta === '20111'), false, 'No debe existir línea 20111 en compra periódica');
  assert.equal(compraPeriodica.lineas.some(l => l.codigoCuenta === '6111'), false, 'No debe existir línea 6111 en compra periódica');
  console.log('✔ PASÓ Test 1: Compra periódica genera 60111 + 40111 vs 4212 sin 20111/6111.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 2: Compra permanente destino 1: genera 20111 / 6111
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Compra permanente destino 1 (genera 20111 / 6111)');
  await empresaRepository.actualizarMetodoInventario(empresaPruebaId, 'PERMANENTE');

  const compraPermanente = await contabilizacionService.generarAsientoCompraAutomatizada(empresaPruebaId, {
    proveedorId: 'anx-prov-01',
    docTipo: '01',
    docSerie: 'F001',
    docNumero: '00000002',
    fechaEmision: '2026-09-12',
    baseImponible: 1000.00,
    cuentaCompra: '6011',
    destino: '1'
  });

  assert.equal(compraPermanente.cuadrado, true, 'El asiento permanente debe estar cuadrado');
  assert.equal(compraPermanente.totalDebe, 2180.00, 'Debe total: Base 1000 + IGV 180 + Almacén 1000 = 2180');
  assert.equal(compraPermanente.totalHaber, 2180.00, 'Haber total: Proveedor 1180 + Variación 1000 = 2180');
  assert.equal(compraPermanente.lineas.some(l => l.codigoCuenta === '20111' && l.debe === 1000), true, 'Línea almacén 20111 al Debe');
  assert.equal(compraPermanente.lineas.some(l => l.codigoCuenta === '6111' && l.haber === 1000), true, 'Línea variación 6111 al Haber');
  console.log('✔ PASÓ Test 2: Compra permanente genera 20111 / 6111 de destino de inventarios.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 3: Compra destino 3: IGV sumado al costo en 6011 (sin 40111)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Compra destino 3: IGV sumado al costo en 6011 (sin 40111)');
  const compraDestino3 = await contabilizacionService.generarAsientoCompraAutomatizada(empresaPruebaId, {
    proveedorId: 'anx-prov-02',
    docTipo: '01',
    docSerie: 'F001',
    docNumero: '00000003',
    fechaEmision: '2026-09-14',
    baseImponible: 1000.00,
    cuentaCompra: '6011',
    destino: '3' // Sin derecho a crédito fiscal
  });

  assert.equal(compraDestino3.cuadrado, true, 'El asiento de destino 3 debe estar cuadrado');
  // Costo total = 1000 + 180 = 1180 cargado en cuenta de detalle 60111
  assert.equal(compraDestino3.lineas.some(l => (l.codigoCuenta === '6011' || l.codigoCuenta === '60111') && l.debe === 1180.00), true, 'Línea 60111 debe tener Base + IGV = 1180');
  assert.equal(compraDestino3.lineas.some(l => l.codigoCuenta === '40111'), false, 'En destino 3 NO debe haber cuenta 40111 de crédito fiscal');
  assert.equal(compraDestino3.lineas.some(l => l.codigoCuenta === '4212' && l.haber === 1180.00), true, 'Obligación 4212 por 1180');
  console.log('✔ PASÓ Test 3: Compra destino 3 suma el IGV al costo (6011) sin crédito fiscal 40111.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 4: Venta permanente: costo de venta 69111 / 20111
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Venta permanente: genera costo de venta 69111 / 20111');
  await empresaRepository.actualizarMetodoInventario(empresaPruebaId, 'PERMANENTE');

  const ventaPermanente = await contabilizacionService.generarAsientoVentaAutomatizada(empresaPruebaId, {
    clienteId: 'anx-cli-01',
    docTipo: '01',
    docSerie: 'F001',
    docNumero: '00000050',
    fechaEmision: '2026-09-15',
    baseImponible: 2500.00,
    igv: 450.00,
    cuentaVenta: '70111',
    costoVenta: 1500.00 // Obtenido del Kardex
  });

  assert.equal(ventaPermanente.cuadrado, true, 'El asiento de venta debe estar cuadrado');
  assert.equal(ventaPermanente.lineas.some(l => l.codigoCuenta === '1212' && l.debe === 2950.00), true, 'Cliente 1212 al Debe por total 2950');
  assert.equal(ventaPermanente.lineas.some(l => l.codigoCuenta === '40111' && l.haber === 450.00), true, 'IGV 40111 al Haber por 450');
  assert.equal(ventaPermanente.lineas.some(l => l.codigoCuenta === '70111' && l.haber === 2500.00), true, 'Venta 70111 al Haber por 2500');
  assert.equal(ventaPermanente.lineas.some(l => l.codigoCuenta === '69111' && l.debe === 1500.00), true, 'Costo de ventas 69111 al Debe por 1500');
  assert.equal(ventaPermanente.lineas.some(l => l.codigoCuenta === '20111' && l.haber === 1500.00), true, 'Descargo almacén 20111 al Haber por 1500');
  console.log('✔ PASÓ Test 4: Venta permanente incluye D 69111 / H 20111 por costo de kardex.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 5: Consolidación mensual: idempotencia (2da ejecución no duplica)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Consolidación mensual: idempotencia garantizada');
  await empresaRepository.actualizarMetodoInventario(empresaPruebaId, 'PERMANENTE');

  // Primera ejecución
  const res1 = await consolidacionMensualService.contabilizar(empresaPruebaId, periodoAbierto, userId);
  assert.equal(res1.yaExistia, false, 'La primera consolidación no debe existir previamente');
  assert.ok(res1.asientosGenerados.length >= 1, 'Debe haber generado al menos 1 asiento de consolidación');
  const totalAsientosPrimeraVez = ASIENTOS_MEMORIA.filter(a => a.empresaId === empresaPruebaId && a.origen === 'CONSOLIDACION').length;

  // Segunda ejecución inmediata (idempotencia)
  const res2 = await consolidacionMensualService.contabilizar(empresaPruebaId, periodoAbierto, userId);
  assert.equal(res2.yaExistia, true, 'La segunda ejecución debe detectar consolidación existente');
  assert.equal(res2.asientosGenerados.length, 0, 'No debe generar asientos duplicados');
  const totalAsientosSegundaVez = ASIENTOS_MEMORIA.filter(a => a.empresaId === empresaPruebaId && a.origen === 'CONSOLIDACION').length;
  assert.equal(totalAsientosSegundaVez, totalAsientosPrimeraVez, 'El número de asientos contables no debe aumentar tras segunda llamada');
  console.log('✔ PASÓ Test 5: Idempotencia verificada: ejecutar consolidación dos veces no duplica asientos.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 6: Consolidación en período cerrado: rechazada con PERIODO_CERRADO
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Consolidación en período cerrado es bloqueada con PERIODO_CERRADO');
  await assert.rejects(
    async () => {
      await consolidacionMensualService.calcular(empresaPruebaId, periodoCerrado, userId);
    },
    (err: any) => {
      return err.message.includes('PERIODO_CERRADO');
    },
    'Debe rechazar el cálculo en período cerrado'
  );

  await assert.rejects(
    async () => {
      await consolidacionMensualService.contabilizar(empresaPruebaId, periodoCerrado, userId);
    },
    (err: any) => {
      return err.message.includes('PERIODO_CERRADO');
    },
    'Debe rechazar la contabilización en período cerrado'
  );
  console.log('✔ PASÓ Test 6: Rechazo estricto con PERIODO_CERRADO en períodos cerrados.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 7: Extorno de consolidación: revierte asientos y restaura saldo previo
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Extorno de consolidación: genera contra-asientos y actualiza estado');
  const extornoRes = await consolidacionMensualService.extornar(
    empresaPruebaId,
    periodoAbierto,
    userId,
    'Corrección de saldos antes del balance trimestral'
  );

  assert.equal(extornoRes.consolidacionExtornada.estado, 'EXTORNADO', 'La consolidación debe quedar en estado EXTORNADO');
  assert.ok(extornoRes.extornosGenerados.length >= 1, 'Debe haber generado asientos de extorno');

  for (const ext of extornoRes.extornosGenerados) {
    assert.equal(ext.origen, 'EXTORNO', 'El origen del asiento debe ser EXTORNO');
    assert.equal(ext.estado, 'CONTABILIZADO', 'El asiento de extorno debe estar CONTABILIZADO');
    assert.equal(ext.cuadrado, true, 'El asiento de extorno debe estar perfectamente cuadrado');
  }

  // Verificar que el asiento original fue marcado como ANULADO
  const original = ASIENTOS_MEMORIA.find(a => a.id === extornoRes.extornosGenerados[0].origenId);
  if (original) {
    assert.equal(original.estado, 'ANULADO', 'El asiento original consolidado debe quedar marcado como ANULADO');
  }
  console.log('✔ PASÓ Test 7: Extorno genera contra-asientos invertidos y deja la consolidación en EXTORNADO.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 8: Empresa sin método de inventario: bloquea automatización (METODO_INVENTARIO_REQUERIDO)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Bloqueo cuando la empresa no tiene método de inventario configurado');
  await assert.rejects(
    async () => {
      await contabilizacionService.generarAsientoCompraAutomatizada('emp-test-sin-metodo', {
        proveedorId: 'anx-prov-01',
        docTipo: '01',
        docSerie: 'F001',
        docNumero: '00000099',
        fechaEmision: '2026-09-10',
        baseImponible: 1000.00,
        destino: '1'
      });
    },
    (err: any) => {
      return err.message.includes('METODO_INVENTARIO_REQUERIDO');
    },
    'Debe bloquear compra automática si la empresa no tiene método'
  );

  await assert.rejects(
    async () => {
      await consolidacionMensualService.calcular('emp-test-sin-metodo', periodoAbierto, userId);
    },
    (err: any) => {
      return err.message.includes('METODO_INVENTARIO_REQUERIDO');
    },
    'Debe bloquear consolidación mensual si la empresa no tiene método'
  );
  console.log('✔ PASÓ Test 8: Bloqueo garantizado con METODO_INVENTARIO_REQUERIDO si falta configuración.');
  pruebasPasadas++;

  // --------------------------------------------------------------------------
  // TEST 9: Cinta: contiene exactamente los 7 accesos definidos y preserva atajos
  // --------------------------------------------------------------------------
  console.log('\n[TEST 9] Cinta de opciones (Ribbon): exactamente 7 accesos y atajos intactos');
  const topBarPath = path.resolve(process.cwd(), 'src/components/desktop/TopBar.tsx');
  const topBarContent = fs.readFileSync(topBarPath, 'utf8');

  // 1. Extraer la barra de herramientas de acceso rápido (role="toolbar")
  const toolbarStart = topBarContent.indexOf('role="toolbar"');
  const headerEnd = topBarContent.indexOf('</header>');
  assert.ok(toolbarStart !== -1 && headerEnd !== -1, 'Debe existir el contenedor role="toolbar" en el header');
  const toolbarHtml = topBarContent.slice(toolbarStart, headerEnd);

  // 2. Verificar que los 6 botones de la franja de acciones y el buscador de la Franja 1 están presentes
  const botonesFranjaAcciones = [
    'Registrar compra',
    'Registrar venta',
    'Asiento nuevo',
    'Consolidar mes',
    'Conciliar SIRE',
    'Cambiar empresa'
  ];

  for (const b of botonesFranjaAcciones) {
    assert.ok(toolbarHtml.includes(b), `El botón "${b}" debe estar presente en la cinta de acciones`);
  }

  // El 7mo acceso (Paleta de comandos) reside en la Franja 1 como el buscador principal
  assert.ok(
    topBarContent.includes('Buscar o ejecutar un comando') && topBarContent.includes('Ctrl+Shift+P'),
    'El acceso a la Paleta de comandos debe estar presente en la Franja 1 como buscador [Ctrl+Shift+P]'
  );

  // 3. Contar los elementos <button dentro de la barra de herramientas: exactamente 6 en la franja
  const buttonMatches = toolbarHtml.match(/<button/g);
  assert.equal(buttonMatches?.length, 6, `La cinta de acciones debe tener exactamente 6 botones, encontrados: ${buttonMatches?.length}`);

  // 4. Verificar que los botones quitados NO están en la cinta
  const botonesQuitados = [
    'Emitir comprobante',
    'Respaldar',
    'Calculadora',
    'Imprimir'
  ];

  for (const b of botonesQuitados) {
    assert.equal(toolbarHtml.includes(`<span>${b}</span>`), false, `El botón "${b}" NO debe estar en la cinta`);
  }

  // 5. Verificar que los atajos de teclado siguen existiendo en el código del componente
  const atajosEsperados = ['F2', 'F3', 'F4', 'Ctrl+K', 'Ctrl+B', 'Ctrl+Shift+C', 'Ctrl+Shift+P'];
  for (const atajo of atajosEsperados) {
    if (atajo.includes('Ctrl+Shift+C')) {
      assert.ok(topBarContent.includes("key === 'C' || e.key === 'c'"), 'Atajo Ctrl+Shift+C debe seguir funcionando');
    } else if (atajo.includes('Ctrl+K')) {
      assert.ok(topBarContent.includes("key === 'k' || e.key === 'K'"), 'Atajo Ctrl+K debe seguir funcionando');
    } else if (atajo.includes('Ctrl+B')) {
      assert.ok(topBarContent.includes("key === 'b' || e.key === 'B'"), 'Atajo Ctrl+B debe seguir funcionando');
    } else if (atajo.includes('F2')) {
      assert.ok(topBarContent.includes("key === 'F2'"), 'Atajo F2 debe seguir funcionando');
    } else if (atajo.includes('F3')) {
      assert.ok(topBarContent.includes("key === 'F3'"), 'Atajo F3 debe seguir funcionando');
    } else if (atajo.includes('F4')) {
      assert.ok(topBarContent.includes("key === 'F4'"), 'Atajo F4 debe seguir funcionando');
    }
  }

  // 6. Verificar que el botón de cerrar en App.tsx no tiene el texto duplicado "Cerrar"
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  assert.equal(
    appContent.includes('<X className="w-3 h-3" strokeWidth={1.5} />\n                <span>Cerrar</span>'),
    false,
    'El botón cerrar del breadcrumb no debe duplicar la X con texto Cerrar'
  );

  console.log('✔ PASÓ Test 9: Cinta contiene exactamente los 7 accesos, quitó los 4 solicitados y preserva atajos.');
  pruebasPasadas++;

  console.log(`\n======================================================`);
  console.log(`RESULTADO DE LA SUITE: ${pruebasPasadas}/${totalPruebas} PRUEBAS PASADAS SATISFACTORIAMENTE`);
  console.log(`======================================================`);
}

testRunner().catch(err => {
  console.error('\n❌ ERROR EN LA SUITE DE AUTOMATIZACION Y CINTA:', err);
  process.exit(1);
});
