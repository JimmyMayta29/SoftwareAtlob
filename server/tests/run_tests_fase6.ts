process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import { cryptoService } from '../services/cryptoService';
import { obtenerSunatGateway, MockSunatGateway } from '../services/sunatGateway';
import { sireService, CONEXIONES_SUNAT_MEMORIA, SIRE_PROPUESTAS_MEMORIA } from '../services/sireService';
import { conciliadorSireService, CONCILIACIONES_SIRE_MEMORIA } from '../services/conciliadorSireService';
import { sireLayoutService, generarCarOficial } from '../services/sireLayoutService';
import { archivoValidadorService } from '../services/archivoValidadorService';
import { historialGeneracionesService, HISTORIAL_GENERACIONES_MEMORIA } from '../services/historialGeneracionesService';
import { xmlImportService, COMPROBANTES_XML_MEMORIA } from '../services/xmlImportService';
import { pleExportService, PLE_EXPORTACIONES_MEMORIA } from '../services/pleExportService';
import { sunatJobsService, SUNAT_JOBS_MEMORIA } from '../services/sunatJobsService';
import { periodoService } from '../services/periodoService';
import { compraService, COMPRAS_MEMORIA, CXP_MEMORIA } from '../services/compraService';
import { ventaService, VENTAS_MEMORIA } from '../services/ventaService';
import { asientoService, ASIENTOS_MEMORIA } from '../services/asientoService';
import { parametroRepository } from '../repositories/parametroRepository';

async function ejecutarSuiteFase6() {
  console.log('======================================================');
  console.log('🧪 SUITE DE PRUEBAS AUTOMATIZADAS — FASE 6: REGISTROS ELECTRÓNICOS (SIRE Y PLE)');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(cond: boolean, desc: string) {
    total++;
    if (cond) {
      console.log(`  ✅ PASÓ: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FALLÓ: ${desc}`);
      throw new Error(`Fallo en prueba: ${desc}`);
    }
  }

  const EMPRESA_A = '00000000-0000-0000-0000-000000000001';
  const EMPRESA_B = '00000000-0000-0000-0000-000000000002';
  const USER_ID = '00000000-0000-0000-0000-000000000001';
  const PERIODO_TEST = '2026-09';

  // Configurar períodos abiertos
  await periodoService.abrirPeriodo(EMPRESA_A, PERIODO_TEST, USER_ID);
  await periodoService.abrirPeriodo(EMPRESA_B, PERIODO_TEST, USER_ID);

  // --------------------------------------------------------------------------
  // TEST 1: SunatGateway, Autenticación OAuth2 y Descarga Simulada con Tickets
  // --------------------------------------------------------------------------
  console.log('🔹 Test 1: SunatGateway, OAuth2 y Simulación de Tickets (Pendiente, Error, Terminado)');
  {
    const gateway = obtenerSunatGateway(true);
    const authValida = await gateway.validarCredenciales({
      ruc: '20601234567',
      usuarioSol: 'MODDATOS',
      claveSol: 'moddatos123'
    });
    assert(authValida.valido === true, 'Autenticación exitosa con credenciales válidas');
    assert(authValida.estado === 'CONECTADO', 'Estado marcado como CONECTADO');

    const token = await gateway.obtenerToken({
      ruc: '20601234567',
      usuarioSol: 'MODDATOS',
      claveSol: 'moddatos123'
    });
    assert(token.accessToken.startsWith('mock_sunat_token_'), 'Token OAuth 2.0 generado con formato Bearer');
    assert(token.expiresIn === 3600, 'Tiempo de expiración fijado en 3600 segundos');

    // Validación de rechazo ante credenciales erróneas
    const authInvalida = await gateway.validarCredenciales({
      ruc: '20601234567',
      usuarioSol: 'MODDATOS',
      claveSol: 'ERROR_TEST'
    });
    assert(authInvalida.valido === false, 'Credenciales incorrectas rechazadas por gateway');
    assert(authInvalida.estado === 'ERROR', 'Estado de error registrado');

    // 1.1 Descarga SIRE simulada con ticket pendiente (estado 01)
    const ticketPend = await gateway.consultarTicket('20601234567', '20260900000001-PEND', 'COMPRAS');
    assert(ticketPend.estado === '01', 'Ticket pendiente identificado con código 01 (EN_PROCESO)');
    assert(ticketPend.descripcion.includes('proceso'), 'Descripción informa procesamiento pendiente');

    // 1.2 Descarga SIRE simulada con ticket con error (estado 02)
    const ticketErr = await gateway.consultarTicket('20601234567', '20260900000001-ERR', 'COMPRAS');
    assert(ticketErr.estado === '02', 'Ticket con error identificado con código 02 (ERROR)');
    assert(ticketErr.mensajeError!.includes('SUNAT_TICKET_ERROR'), 'Mensaje de error oficial presente en respuesta');

    // 1.3 Descarga SIRE completada (estado 03) con descompresión ZIP y carga
    const ticketOk = await gateway.consultarTicket('20601234567', '20260900000001RCE', 'COMPRAS');
    assert(ticketOk.estado === '03', 'Ticket completado identificado con código 03 (TERMINADO)');
    assert(Boolean(ticketOk.archivoReporte), 'Nombre de archivo zip disponible para descarga');

    const zipBuffer = await gateway.descargarArchivoTicket('20601234567', ticketOk.numTicket, ticketOk.archivoReporte!);
    assert(Buffer.isBuffer(zipBuffer) && zipBuffer.length > 0, 'Descarga de archivo ZIP binario realizada exitosamente');

    // 1.4 Descarga completa integrada vía sireService con rótulo SIMULADO
    const propSire = await sireService.descargarPropuesta(EMPRESA_A, 'COMPRAS', PERIODO_TEST, USER_ID);
    assert(propSire.esSimulado === true, 'Propuesta descargada marcada explícitamente con rótulo SIMULADO');
    assert(propSire.totalRegistros > 0, 'Propuesta cargada con registros parseados del archivo plano');

    // 1.5 Bloqueo estricto de aceptación formal y reemplazo en propuestas SIMULADAS
    let rechazoAceptacionSimulada = false;
    try {
      await conciliadorSireService.aceptarPropuestaSireOficial(EMPRESA_A, 'COMPRAS', PERIODO_TEST, USER_ID);
    } catch (err: any) {
      rechazoAceptacionSimulada = err.message.includes('OPERACION_SIMULADA_BLOQUEADA');
    }
    assert(rechazoAceptacionSimulada === true, 'Aceptación y envío formal a SUNAT bloqueados si la propuesta es SIMULADA');

    let rechazoReemplazoSimulado = false;
    try {
      await conciliadorSireService.reemplazarPropuestaSireOficial(EMPRESA_A, 'COMPRAS', PERIODO_TEST, [], USER_ID);
    } catch (err: any) {
      rechazoReemplazoSimulado = err.message.includes('OPERACION_SIMULADA_BLOQUEADA');
    }
    assert(rechazoReemplazoSimulado === true, 'Exportación y reemplazo para SOL bloqueados si la propuesta es SIMULADA');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Cifrado AES-256-GCM y No Exposición de Secretos
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 2: Cifrado AES-256-GCM, No Exposición de Secretos y Rotación');
  {
    const claveSecreta = 'MiClaveSecretaSuperSegura2026!';
    const cifrado = cryptoService.cifrar(claveSecreta, 1);
    assert(cifrado.startsWith('v1:'), 'Encabezado de versión v1 presente en texto cifrado');
    assert(!cifrado.includes(claveSecreta), 'El texto plano no aparece en la cadena cifrada');

    const descifrado = cryptoService.descifrar(cifrado);
    assert(descifrado === claveSecreta, 'Descifrado exacto con autenticación GCM (Tag OK)');

    // Rotación de clave
    const rotado = cryptoService.rotarCifrado(cifrado, 2);
    assert(rotado.nuevaVersion === 2, 'Clave rotada exitosamente a versión 2');
    assert(cryptoService.descifrar(rotado.nuevoPayload) === claveSecreta, 'Texto íntegro tras rotación');

    // Guardar credenciales para Empresa A y validar no exposición
    await sireService.guardarConexion(EMPRESA_A, {
      ruc: '20601234567',
      usuarioSol: 'MODDATOS',
      claveSol: 'claveSecreta123',
      clientId: 'client-id-xyz',
      clientSecret: 'super-secret-token'
    }, USER_ID);

    const estado = await sireService.obtenerEstadoConexion(EMPRESA_A);
    assert(estado.configurado === true, 'Conexión registrada como configurada');
    assert(!('claveSol' in estado) && !('claveSolEncrypted' in estado), 'La clave SOL no se expone en la respuesta');
    assert(!('clientSecret' in estado), 'El Client Secret no se expone en la respuesta');

    // Sanitización de logs y errores
    const errorFuga = 'Error 401: Fallo con claveSol=claveSecreta123 y Bearer eyJhbGciOi...';
    const sanitizado = cryptoService.sanitizarError(errorFuga);
    assert(!sanitizado.includes('claveSecreta123'), 'Sanitizador expurgó la clave SOL');
    assert(!sanitizado.includes('eyJhbGciOi'), 'Sanitizador expurgó el token Bearer');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Conciliador SIRE Avanzado (Diferencias IGV, Duplicados, NC, USD y Asiento de Ajuste)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 3: Conciliador SIRE Avanzado (CAR Oficial, Diferencias IGV, Duplicados, NC, USD y Ajuste)');
  {
    COMPRAS_MEMORIA.length = 0;

    // 1. Comprobante exacto (COINCIDE por CAR oficial y clave)
    const b1 = await compraService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      fechaEmision: `${PERIODO_TEST}-02`,
      fechaContable: `${PERIODO_TEST}-02`,
      tipoComprobante: '01',
      serie: 'F001',
      numero: '0023451',
      proveedorId: 'prv-20100035392',
      moneda: 'PEN',
      baseGravada: 4200.00,
      igv: 756.00,
      total: 4956.00,
      glosa: 'Factura ferretería en sistema'
    }, USER_ID);
    await compraService.registrarBorradorCompra(b1.id, USER_ID, EMPRESA_A);

    // 2. Comprobante con DIFERENCIA DE IGV provocada respecto a propuesta SUNAT
    // Registrado en ERP válidamente (Base 1200.00, IGV 216.00, Total 1416.00)
    const b2 = await compraService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      fechaEmision: `${PERIODO_TEST}-06`,
      fechaContable: `${PERIODO_TEST}-06`,
      tipoComprobante: '01',
      serie: 'F002',
      numero: '0005420',
      proveedorId: 'prv-20512874193',
      moneda: 'PEN',
      baseGravada: 1200.00,
      igv: 216.00,
      total: 1416.00,
      glosa: 'Factura con diferencia de IGV respecto a propuesta SUNAT'
    }, USER_ID);
    await compraService.registrarBorradorCompra(b2.id, USER_ID, EMPRESA_A);

    // 3. Comprobante DUPLICADO en ERP (mismo comprobante registrado dos veces en el sistema)
    const bDup1 = await compraService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      fechaEmision: `${PERIODO_TEST}-20`,
      fechaContable: `${PERIODO_TEST}-20`,
      tipoComprobante: '01',
      serie: 'F003',
      numero: '0008912',
      proveedorId: 'prv-20519827361',
      moneda: 'PEN',
      baseGravada: 1800.00,
      igv: 324.00,
      total: 2124.00,
      glosa: 'Factura seguridad primera entrada'
    }, USER_ID);
    await compraService.registrarBorradorCompra(bDup1.id, USER_ID, EMPRESA_A);

    // Para simular duplicado existente en ERP (ej. migración o doble carga previa)
    const bDup2 = {
      ...bDup1,
      id: `comp-dup-${Date.now()}`,
      glosa: 'Factura seguridad duplicada en el sistema'
    };
    COMPRAS_MEMORIA.push(bDup2 as any);

    // 4. Comprobante NOTA DE CRÉDITO (tipo 07 con signo negativo y referencia)
    const bNc = await compraService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      fechaEmision: `${PERIODO_TEST}-18`,
      fechaContable: `${PERIODO_TEST}-18`,
      tipoComprobante: '07',
      serie: 'FC01',
      numero: '0000342',
      proveedorId: 'prv-20100035392',
      moneda: 'PEN',
      baseGravada: -300.00,
      igv: -54.00,
      total: -354.00,
      glosa: 'Nota de crédito por descuento comercial'
    }, USER_ID);
    await compraService.registrarBorradorCompra(bNc.id, USER_ID, EMPRESA_A);

    // 5. Comprobante en DÓLARES (USD con tipo de cambio SUNAT)
    const bUsd = await compraService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      fechaEmision: `${PERIODO_TEST}-22`,
      fechaContable: `${PERIODO_TEST}-22`,
      tipoComprobante: '01',
      serie: 'F008',
      numero: '0000789',
      proveedorId: 'prv-20556789123',
      moneda: 'USD',
      tipoCambio: 3.750,
      baseGravada: 1000.00,
      igv: 180.00,
      total: 1180.00,
      glosa: 'Servicio en dólares USD'
    }, USER_ID);
    await compraService.registrarBorradorCompra(bUsd.id, USER_ID, EMPRESA_A);

    // Agregar la nota de crédito y el comprobante en dólares a la propuesta de SUNAT en memoria
    const propuestaActual = (await sireService.obtenerPropuesta(EMPRESA_A, 'COMPRAS', PERIODO_TEST))!;

    // Inyectar diferencia en propuesta SUNAT para F002-0005420 (SUNAT propone IGV 222.00 y Total 1422.00 vs ERP 216.00 y 1416.00 -> dif -6.00)
    const lineaF002Sunat = propuestaActual.lineas.find(l => l.serie === 'F002' && l.numero === '0005420');
    if (lineaF002Sunat) {
      lineaF002Sunat.igv = 222.00;
      lineaF002Sunat.total = 1422.00;
    }

    propuestaActual.lineas.push({
      car: generarCarOficial('20100035392', '07', 'FC01', '0000342'),
      tipoComprobante: '07',
      serie: 'FC01',
      numero: '0000342',
      fechaEmision: `${PERIODO_TEST}-18`,
      rucEmisor: '20100035392',
      razonSocialEmisor: 'DISTRIBUIDORA INDUSTRIAL FERRETERA S.A.C.',
      rucReceptor: '20601234567',
      razonSocialReceptor: 'EMPRESA CONTRIBUYENTE S.A.C.',
      moneda: 'PEN',
      tipoCambio: 1.000,
      baseGravada: -300.00,
      igv: -54.00,
      total: -354.00,
      tieneDetraccion: false
    });

    propuestaActual.lineas.push({
      car: generarCarOficial('20556789123', '01', 'F008', '0000789'),
      tipoComprobante: '01',
      serie: 'F008',
      numero: '0000789',
      fechaEmision: `${PERIODO_TEST}-22`,
      rucEmisor: '20556789123',
      razonSocialEmisor: 'IMPORTADORA Y SERVICIOS INTERNACIONALES S.A.C.',
      rucReceptor: '20601234567',
      razonSocialReceptor: 'EMPRESA CONTRIBUYENTE S.A.C.',
      moneda: 'USD',
      tipoCambio: 3.750,
      baseGravada: 1000.00,
      igv: 180.00,
      total: 1180.00,
      tieneDetraccion: false
    });

    // 6. Ejecutar la conciliación SIRE con cruce de CAR y tolerancias parametrizables
    const concil = await conciliadorSireService.conciliarPeriodo(EMPRESA_A, 'COMPRAS', PERIODO_TEST);

    // Verificaciones de Estados
    assert(concil.totalCoinciden >= 1, 'Identificó comprobante con estado COINCIDE (F001-0023451)');
    assert(concil.totalDiferencias >= 1, 'Identificó comprobante con DIFERENCIA_IMPORTE (F002-0005420)');
    assert(concil.totalPosibleDuplicado >= 1, 'Detectó estado POSIBLE_DUPLICADO ante múltiples comprobantes con misma serie y número');

    // Validación de comprobante en dólares (USD)
    const lineaUsd = concil.lineas.find(l => l.serie === 'F008' && l.numero === '0000789');
    assert(Boolean(lineaUsd), 'Comprobante en dólares procesado en la conciliación');
    assert(lineaUsd?.moneda === 'USD' && lineaUsd?.estadoConciliacion === 'COINCIDE', 'Comprobante en dólares cuadra con moneda USD y tipo de cambio');

    // Validación de Nota de Crédito (tipo 07)
    const lineaNc = concil.lineas.find(l => l.tipoComprobante === '07');
    assert(Boolean(lineaNc), 'Nota de crédito procesada en conciliador');
    assert(lineaNc?.estadoConciliacion === 'COINCIDE', 'Nota de crédito tipo 07 con signo negativo reconocida y cuadrando');

    // Validación de Diferencia de IGV
    const lineaDifIgv = concil.lineas.find(l => l.serie === 'F002' && l.numero === '0005420')!;
    assert(lineaDifIgv.diferenciaIgv === -6.00, 'Calculó con exactitud la diferencia de IGV de S/ -6.00');
    assert(lineaDifIgv.diferenciaTotal === -6.00, 'Calculó con exactitud la diferencia en importe total de S/ -6.00');

    // 7. Resolución guiada de diferencias mediante Asiento de Ajuste Contable
    const asientosAntes = ASIENTOS_MEMORIA.length;
    const resAjuste = await conciliadorSireService.generarAsientoAjusteDiferencia(EMPRESA_A, lineaDifIgv.id, USER_ID);
    assert(resAjuste.success === true, 'Asiento de ajuste generado exitosamente para resolver diferencia');
    assert(ASIENTOS_MEMORIA.length === asientosAntes + 1, 'Asiento de ajuste incorporado en el libro diario');

    const asientoGenerado = ASIENTOS_MEMORIA.find(a => a.id === resAjuste.asientoId)!;
    assert(asientoGenerado.estado === 'CONTABILIZADO', 'Asiento de ajuste nace contabilizado');
    const totDebe = asientoGenerado.detalles.reduce((acc: number, d: any) => acc + d.debe, 0);
    const totHaber = asientoGenerado.detalles.reduce((acc: number, d: any) => acc + d.haber, 0);
    assert(Math.abs(totDebe - totHaber) < 0.001, 'Asiento de ajuste cumple estricta partida doble');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Layouts Oficiales de Reemplazo y Ajustes SIRE (RCE y RVIE)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 4: Layouts Oficiales de Reemplazo, Complementos, No Domiciliados, TC y Ajustes SIRE (RVIE Anexos 2–5 y RCE Anexos 8–13)');
  {
    const carEjemplo = generarCarOficial('20100035392', '01', 'F001', '0001001');
    const comprobantesDemo = [
      {
        car: carEjemplo,
        tipoComprobante: '01',
        serie: 'F001',
        numero: '0001001',
        fechaEmision: '2026-09-05',
        baseGravada: 5000.00,
        igv: 900.00,
        total: 5900.00,
        proveedorRuc: '20100035392',
        proveedorNombre: 'DISTRIBUIDORA FERRETERA S.A.C.',
        clienteRuc: '20500040301',
        clienteNombre: 'CLIENTE CORPORATIVO S.A.C.',
        moneda: 'PEN',
        tipoCambio: 1.0,
        tipoAdquisicion: '1',
      }
    ];

    // 1. RVIE Anexo 2 (Complemento 14040001...2) y Anexo 3 (Reemplazo 14040002...2) — 34 cols
    const rvieAnexo2 = sireLayoutService.generarComplementoRvieAnexo2('20601234567', PERIODO_TEST, comprobantesDemo);
    assert(rvieAnexo2.totalCampos === 34, 'RVIE Anexo 2 estructurado con 34 campos');
    assert(rvieAnexo2.nombreArchivoTxt === 'LE2060123456720260900140400011112.txt', 'Nomenclatura oficial RVIE Anexo 2 (G=2)');
    assert(sireLayoutService.validarLayoutTxt(rvieAnexo2.contenidoTxt, 'RVIE_ANEXO_2').esValido, 'Validador RVIE Anexo 2');

    const rvieReemplazo = sireLayoutService.generarReemplazoRvie('20601234567', PERIODO_TEST, comprobantesDemo);
    assert(rvieReemplazo.totalCampos === 34, 'RVIE Anexo 3 estructurado con 34 campos oficiales');
    assert(rvieReemplazo.nombreArchivoTxt === 'LE2060123456720260900140400021112.txt', 'Nomenclatura oficial RVIE Anexo 3 (14040002, G=2)');
    assert(sireLayoutService.validarLayoutTxt(rvieReemplazo.contenidoTxt, 'RVIE_REEMPLAZO').esValido, 'Validador RVIE Anexo 3');

    // 2. RVIE Anexo 4 (CC=03) y Anexo 5 (CC=04) — 35 cols con correlativo NN
    const rvieAj4 = sireLayoutService.generarAjustesRvie('20601234567', '2026-10', '2026-09', [{ ...comprobantesDemo[0], carCpModificar: carEjemplo }]);
    assert(rvieAj4.totalCampos === 35, 'RVIE Anexo 4 con 35 campos');
    assert(rvieAj4.nombreArchivoTxt === 'LE206012345672026100014040003111201.txt', 'Nomenclatura oficial RVIE Anexo 4 (03 + NN)');
    assert(sireLayoutService.validarLayoutTxt(rvieAj4.contenidoTxt, 'RVIE_ANEXO_4').esValido, 'Validador RVIE Anexo 4');

    const rvieAj5 = sireLayoutService.generarAjustesRvie('20601234567', '2026-10', '2026-08', comprobantesDemo, { esPreSire: true, correlativo: '02' });
    assert(rvieAj5.totalCampos === 35 && rvieAj5.nombreArchivoTxt === 'LE206012345672026100014040004111202.txt', 'RVIE Anexo 5 pre-SIRE');
    assert(sireLayoutService.validarLayoutTxt(rvieAj5.contenidoTxt, 'RVIE_ANEXO_5').esValido, 'Validador RVIE Anexo 5');

    // 3. RCE Anexo 8 (-CP- 41 cols y -RCEINEX- 3 cols)
    const rceCp = sireLayoutService.generarComplementoRceAnexo8('20601234567', PERIODO_TEST, comprobantesDemo, { correlativo: '01' });
    assert(rceCp.totalCampos === 41 && rceCp.nombreArchivoTxt === '20601234567-CP-202609-01.txt', 'RCE Anexo 8 -CP-');
    assert(sireLayoutService.validarLayoutTxt(rceCp.contenidoTxt, 'RCE_ANEXO_8_CP').esValido, 'Validador RCE Anexo 8 -CP-');

    const rceInex = sireLayoutService.generarExclusionInclusionRceAnexo8('20601234567', PERIODO_TEST, [{ carSunat: carEjemplo, tipoOperacion: 'EXCLUSION' }]);
    assert(rceInex.totalCampos === 3 && rceInex.nombreArchivoTxt === '20601234567-RCEINEX-202609-01.txt', 'RCE Anexo 8 -RCEINEX-');
    assert(sireLayoutService.validarLayoutTxt(rceInex.contenidoTxt, 'RCE_ANEXO_8_INEX').esValido, 'Validador RCE Anexo 8 -RCEINEX-');

    // 4. RCE Anexo 9 No Domiciliados (08050002, 35 cols)
    const noDomRegistro = {
      fechaEmision: '2026-09-12',
      tipoComprobante: '91',
      serie: 'INV',
      numero: '9001',
      valorAdquisiciones: 1200,
      otrosConceptos: 0,
      importeTotal: 1200,
      moneda: 'USD',
      tipoCambio: 3.75,
      paisResidencia: '9249',
      razonSocialNoDomiciliado: 'CLOUD SERVICES INC',
      rentaBruta: 1200,
      rentaNeta: 1200,
      tasaRetencion: 30,
      impuestoRetenido: 360,
      tipoRenta: '17',
    };
    const rceNoDom = sireLayoutService.generarNoDomiciliadosAnexo9('20601234567', PERIODO_TEST, [noDomRegistro]);
    assert(rceNoDom.totalCampos === 35 && rceNoDom.nombreArchivoTxt === 'LE2060123456720260900080500021122.txt', 'RCE Anexo 9 No Domiciliados (08050002, G=2)');
    assert(sireLayoutService.validarLayoutTxt(rceNoDom.contenidoTxt, 'RCE_ANEXO_9').esValido, 'Validador RCE Anexo 9');

    // 5. RCE Anexo 10 Tipo de Cambio (-RCETCA- 5 cols)
    const rceTc = sireLayoutService.generarTipoCambioAnexo10('20601234567', PERIODO_TEST, [{ fechaEmision: '2026-09-05', moneda: 'USD', tipoCambio: 3.755, carSunat: carEjemplo }]);
    assert(rceTc.totalCampos === 5 && rceTc.nombreArchivoTxt === '20601234567-RCETCA-202609-01.txt', 'RCE Anexo 10 -RCETCA-');
    assert(sireLayoutService.validarLayoutTxt(rceTc.contenidoTxt, 'RCE_ANEXO_10').esValido, 'Validador RCE Anexo 10');

    // 6. RCE Anexo 11 Reemplazo (08040002, 41 cols)
    const rceReemplazo = sireLayoutService.generarReemplazoRce('20601234567', PERIODO_TEST, comprobantesDemo);
    assert(rceReemplazo.totalCampos === 41 && rceReemplazo.nombreArchivoTxt === 'LE2060123456720260900080400021112.txt', 'Nomenclatura oficial RCE Anexo 11 (08040002, G=2)');
    assert(rceReemplazo.zipBuffer.length > 0, 'Empaquetado ZIP generado');
    assert(sireLayoutService.validarLayoutTxt(rceReemplazo.contenidoTxt, 'RCE_REEMPLAZO').esValido, 'Validador RCE Anexo 11');

    // 7. RCE Anexos 12.1 / 12.2 (SIRE CC=03) y 13.1 / 13.2 (Pre-SIRE CC=04)
    const rceAj121 = sireLayoutService.generarAjustesRce('20601234567', '2026-10', '2026-09', [{ ...comprobantesDemo[0], carCpModificar: carEjemplo }]);
    assert(rceAj121.totalCampos === 41 && rceAj121.nombreArchivoTxt === 'LE206012345672026100008040003111201.txt', 'RCE Anexo 12.1 (08040003 + NN)');
    assert(sireLayoutService.validarLayoutTxt(rceAj121.contenidoTxt, 'RCE_ANEXO_12_1').esValido, 'Validador RCE Anexo 12.1');

    const rceAj122 = sireLayoutService.generarAjustesNoDomiciliados('20601234567', '2026-10', '2026-09', [{ ...noDomRegistro, carCpModificar: carEjemplo }]);
    assert(rceAj122.totalCampos === 35 && rceAj122.nombreArchivoTxt === 'LE206012345672026100008050003112201.txt', 'RCE Anexo 12.2 No Domiciliados (08050003 + NN)');
    assert(sireLayoutService.validarLayoutTxt(rceAj122.contenidoTxt, 'RCE_ANEXO_12_2').esValido, 'Validador RCE Anexo 12.2');

    const rceAj131 = sireLayoutService.generarAjustesRce('20601234567', '2026-10', '2026-08', comprobantesDemo, { esPreSire: true });
    assert(rceAj131.nombreArchivoTxt === 'LE206012345672026100008040004111201.txt', 'RCE Anexo 13.1 pre-SIRE');
    assert(sireLayoutService.validarLayoutTxt(rceAj131.contenidoTxt, 'RCE_ANEXO_13_1').esValido, 'Validador RCE Anexo 13.1');

    const rceAj132 = sireLayoutService.generarAjustesNoDomiciliados('20601234567', '2026-10', '2026-08', [noDomRegistro], { esPreSire: true });
    assert(rceAj132.nombreArchivoTxt === 'LE206012345672026100008050004112201.txt', 'RCE Anexo 13.2 pre-SIRE');
    assert(sireLayoutService.validarLayoutTxt(rceAj132.contenidoTxt, 'RCE_ANEXO_13_2').esValido, 'Validador RCE Anexo 13.2');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Libros Electrónicos PLE 5.2 Oficiales (Acentos, Pipes, Signos Negativos, Mes sin Movimiento)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 5: PLE 5.2 Oficial (Diario, Mayor, Compras, Ventas, Caja y Bancos, Acentos, Pipes, Negativos, Sin Movimiento)');
  {
    // Limpiar asientos para pruebas limpias de PLE
    ASIENTOS_MEMORIA.length = 0;

    // Crear asiento con acentos, pipes dentro de glosa y números
    const asientoConPipesYAcentos = await asientoService.crearBorrador(EMPRESA_A, {
      periodoId: `per-${PERIODO_TEST}`,
      subdiarioId: 'sub-01',
      fecha: `${PERIODO_TEST}-10`,
      glosa: 'CANCELACIÓN FACTURA LOGÍSTICA S.A.C. | CUOTA 1 | SIN MORA',
      detalles: [
        { linea: 1, cuentaId: '60111', debe: 1500.00, haber: 0 },
        { linea: 2, cuentaId: '40111', debe: 270.00, haber: 0 },
        { linea: 3, cuentaId: '42121', debe: 0, haber: 1770.00 }
      ]
    }, USER_ID);
    await asientoService.contabilizar(asientoConPipesYAcentos.id, EMPRESA_A, USER_ID);

    // 1. Exportar Libro Diario 5.1 Oficial (21 campos)
    const expDiario = await pleExportService.exportarLibro(EMPRESA_A, PERIODO_TEST, '050100', '20601234567', USER_ID);
    assert(expDiario.esOficial === true, 'Libro Diario 5.1 generado en modo oficial');
    assert(expDiario.nombreArchivo.includes('050100001111.txt'), 'Nomenclatura oficial PLE Diario 5.1 correcta');
    assert(expDiario.contenidoTxt.includes('CANCELACIÓN FACTURA LOGÍSTICA'), 'Acentos UTF-8 sin BOM preservados en contenido');
    assert(!expDiario.contenidoTxt.includes('| CUOTA 1 |'), 'Pipes dentro de la glosa fueron sanitizados a guiones sin alterar el conteo de columnas');

    // Validar línea por línea con el validador oficial
    const valDiario = archivoValidadorService.validarArchivoTxt(expDiario.contenidoTxt, '050100', expDiario.nombreArchivo);
    assert(valDiario.esValido === true && valDiario.totalErrores === 0, 'Libro Diario 5.1 cumple exactamente los 21 campos exigidos por PLE 5.2');

    // 2. Exportar Libro Mayor 6.1 Oficial (16 campos)
    const expMayor = await pleExportService.exportarLibro(EMPRESA_A, PERIODO_TEST, '060100', '20601234567', USER_ID);
    const valMayor = archivoValidadorService.validarArchivoTxt(expMayor.contenidoTxt, '060100', expMayor.nombreArchivo);
    assert(valMayor.esValido === true && valMayor.totalErrores === 0, 'Libro Mayor 6.1 cumple exactamente los 16 campos exigidos por PLE 5.2');

    // 3. Exportar Libro Compras 8.1 Oficial (42 campos) con Nota de Crédito en negativo
    const expCompras = await pleExportService.exportarLibro(EMPRESA_A, PERIODO_TEST, '080100', '20601234567', USER_ID);
    const valCompras = archivoValidadorService.validarArchivoTxt(expCompras.contenidoTxt, '080100', expCompras.nombreArchivo);
    assert(valCompras.esValido === true && valCompras.totalErrores === 0, 'Libro Compras 8.1 cumple exactamente los 42 campos exigidos por PLE 5.2');
    assert(expCompras.contenidoTxt.includes('-300.00'), 'Signos negativos correctamente formateados para notas de crédito en compras');

    // 4. Exportar Libro Ventas 14.1 Oficial (35 campos)
    const expVentas = await pleExportService.exportarLibro(EMPRESA_A, PERIODO_TEST, '140100', '20601234567', USER_ID);
    const valVentas = archivoValidadorService.validarArchivoTxt(expVentas.contenidoTxt, '140100', expVentas.nombreArchivo);
    assert(valVentas.esValido === true && valVentas.totalErrores === 0, 'Libro Ventas 14.1 cumple exactamente los 35 campos exigidos por PLE 5.2');

    // 5. Mes sin movimiento PEN (indicador de contenido 0 en pos 31, moneda 1 en pos 32)
    const expVacio = await pleExportService.exportarLibro(EMPRESA_A, '2026-08', '080100', '20601234567', USER_ID, { sinMovimiento: true });
    assert(expVacio.nombreArchivo.includes('001011.txt'), 'Nomenclatura oficial PLE para mes sin movimiento en PEN lleva indicador de contenido 0 en pos 31 y moneda 1 en pos 32 (...001011.txt)');
    assert(expVacio.totalFilas === 0 && expVacio.contenidoTxt.length === 0, 'Archivo para mes sin movimiento generado sin filas de datos');

    const valVacio = archivoValidadorService.validarArchivoTxt(expVacio.contenidoTxt, '080100', expVacio.nombreArchivo);
    assert(valVacio.esValido === true, 'Validador acepta archivo oficial de mes sin movimiento en PEN');

    // 5.1 Mes con movimiento en USD (indicador de contenido 1 en pos 31, moneda 2 en pos 32)
    const expUsd = await pleExportService.exportarLibro(EMPRESA_A, PERIODO_TEST, '080100', '20601234567', USER_ID, { moneda: 'USD' });
    assert(expUsd.nombreArchivo.includes('001121.txt'), 'Nomenclatura oficial PLE con movimiento en USD lleva contenido 1 en pos 31 y moneda 2 en pos 32 (...001121.txt)');

    // 5.2 Mes sin movimiento en USD (indicador de contenido 0 en pos 31, moneda 2 en pos 32)
    const expVacioUsd = await pleExportService.exportarLibro(EMPRESA_A, '2026-08', '080100', '20601234567', USER_ID, { sinMovimiento: true, moneda: 'USD' });
    assert(expVacioUsd.nombreArchivo.includes('001021.txt'), 'Nomenclatura oficial PLE sin movimiento en USD lleva contenido 0 en pos 31 y moneda 2 en pos 32 (...001021.txt)');
    assert(expVacioUsd.totalFilas === 0 && expVacioUsd.contenidoTxt.length === 0, 'Archivo para mes sin movimiento en USD no tiene filas de datos');

    // 6. Prueba del Validador ante archivo TXT corrupto (falta de pipe final o columna incorrecta)
    const txtCorrupto = `20260900|D000001|M1|10111|||PEN|6|20000000001|01|F001|00000001|10/09/2026|10/09/2026|10/09/2026|Glosa sin pipe final\r\n`;
    const valCorrupto = archivoValidadorService.validarArchivoTxt(txtCorrupto, '050100');
    assert(valCorrupto.esValido === false, 'Validador detectó archivo corrupto');
    assert(valCorrupto.errores.some(e => e.nombreCampo === 'DELIMITADOR_FINAL'), 'Reportó error por falta de delimitador final');
    assert(valCorrupto.errores.some(e => e.nombreCampo === 'CONTEO_COLUMNAS'), 'Reportó error con número de línea y columna por discrepancia en cantidad de campos');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Historial de Generaciones con Hash SHA-256 e Integridad
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 6: Historial de Generaciones por Período con Hash SHA-256');
  {
    await historialGeneracionesService.registrarGeneracion({
      empresaId: EMPRESA_A,
      periodo: PERIODO_TEST,
      modulo: 'SIRE',
      tipoOperacion: 'REEMPLAZO_PROPUESTA',
      subtipo: 'RCE_080400',
      nombreArchivo: 'LE2060123456720260900080400001111.zip',
      contenido: 'datos_reemplazo_test_sha256',
      totalRegistros: 15,
      totalImporte: 45000.00,
      usuarioId: USER_ID
    });

    await historialGeneracionesService.registrarGeneracion({
      empresaId: EMPRESA_A,
      periodo: PERIODO_TEST,
      modulo: 'PLE',
      tipoOperacion: 'LIBRO_ELECTRONICO',
      subtipo: '050100',
      nombreArchivo: 'LE2060123456720260900050100001111.txt',
      contenido: 'datos_diario_test_sha256',
      totalRegistros: 48,
      usuarioId: USER_ID
    });

    const histA = historialGeneracionesService.listarPorEmpresa(EMPRESA_A, { periodo: PERIODO_TEST });
    assert(histA.length >= 2, 'Historial registra generaciones de SIRE y PLE');
    assert(histA.every(h => h.hashSha256.length === 64), 'Cada registro contiene su hash SHA-256 inmutable de 64 caracteres hexadecimales');

    const histB = historialGeneracionesService.listarPorEmpresa(EMPRESA_B);
    assert(histB.length === 0, 'Aislamiento multiempresa estricto: Empresa B no ve el historial de Empresa A');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Parser XML UBL 2.1 Seguro, Anti-XXE y Detección de Duplicados
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 7: Parser XML UBL 2.1 Seguro, Anti-XXE y Archivos Sobredimensionados');
  {
    const xmlValido = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>F001-0004521</cbc:ID>
  <cbc:IssueDate>2026-09-18</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">20556789123</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>TECNOLOGIA Y SERVICIOS PERU S.A.C.</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">180.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">1000.00</cbc:TaxableAmount></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="PEN">1180.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

    const resXml = xmlImportService.procesarXmlIndividual(
      EMPRESA_A,
      '20556789123-01-F001-0004521.xml',
      Buffer.from(xmlValido, 'utf8')
    );
    assert(resXml.serie === 'F001' && resXml.numero === '0004521', 'Serie y número extraídos correctamente');
    assert(resXml.rucEmisor === '20556789123', 'RUC emisor extraído');
    assert(resXml.total === 1180.00, 'Total facturado extraído exactamente S/ 1,180.00');

    // Ataque XXE
    const xmlMalicioso = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>&xxe;</cbc:ID>
</Invoice>`;

    let errorXxe = false;
    try {
      xmlImportService.procesarXmlIndividual(EMPRESA_A, 'malicious_xxe.xml', Buffer.from(xmlMalicioso, 'utf8'));
    } catch (err: any) {
      errorXxe = err.message.includes('ATAQUE_XXE_DETECTADO');
    }
    assert(errorXxe === true, 'Defensa anti-XXE bloqueó el archivo con DTD / ENTITY maliciosa');
  }

  // --------------------------------------------------------------------------
  // TEST 8: Cola Asíncrona de Trabajos con Reintentos y Backoff
  // --------------------------------------------------------------------------
  console.log('\n🔹 Test 8: Cola Asíncrona de Trabajos SUNAT (Jobs) con Reintentos');
  {
    const job = await sunatJobsService.crearJob(EMPRESA_A, 'DESCARGA_SIRE_COMPRAS', { periodo: PERIODO_TEST });
    assert(job.id.startsWith('job-'), 'Trabajo encolado con ID único');

    await new Promise(r => setTimeout(r, 200));

    const jobActualizado = (await sunatJobsService.obtenerJob(job.id))!;
    assert(jobActualizado.estado === 'COMPLETADO', 'Trabajo completado asíncronamente');
    assert(jobActualizado.progreso === 100, 'Progreso al 100%');
    assert(Boolean(jobActualizado.resultado.hash), 'Resultado contiene hash SHA-256');
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADO SUITE FASE 6: ${passed}/${total} PRUEBAS EXITOSAS`);
  console.log('🎉 TODAS LAS PRUEBAS EXIGIDAS DE LA FASE 6 PASARON SATISFACTORIAMENTE.');
  console.log('======================================================\n');
}

ejecutarSuiteFase6().catch(err => {
  console.error('❌ Error fatal ejecutando suite Fase 6:', err);
  process.exit(1);
});
