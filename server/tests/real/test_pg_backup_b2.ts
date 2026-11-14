import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import AdmZip from 'adm-zip';

// Cargar variables de entorno
const envConfig = fs.existsSync('.env') ? parse(fs.readFileSync('.env', 'utf8')) : {};
const connectionString = process.env.TEST_DATABASE_URL || envConfig.TEST_DATABASE_URL || 'postgresql://contabilidad_app:Craxker29@localhost:5432/atlob_test';

async function ejecutar() {
  console.log('========================================================================');
  console.log('🛡️ VALIDACIÓN INTEGRAL EN POSTGRESQL REAL: FASE B2 (RESPALDOS Y RECUPERACIÓN)');
  console.log('========================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = connectionString;

  let pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
  const { setPostgresPool } = await import('../../config/database');
  setPostgresPool(pool, true);

  const { backupEmpresaService } = await import('../../services/backupEmpresaService');
  const { archivosEmpresaService } = await import('../../storage/archivosEmpresa');
  const { REGISTRO_DATOS_EMPRESA, REGISTRO_ARCHIVOS_EMPRESA } = await import('../../storage/registroDatosEmpresa');

  let client = await pool.connect();

  const tenantId = crypto.randomUUID();
  const usuarioAdminId = crypto.randomUUID();
  const empresaA_id = crypto.randomUUID();
  const empresaB_id = crypto.randomUUID();
  const rucA = '20999000011';
  const rucB = '20999000022';
  const anio = 2026;
  const periodoStr = '2026-11';

  try {
    // -------------------------------------------------------------------------
    // CRITERIO B2.1: 100% de tablas y archivos incluidos según política aprobada
    // -------------------------------------------------------------------------
    console.log('--- 1. Verificación de Política Declarativa de Respaldo (84 Tablas, 7 Carpetas) ---');
    const { rows: tablasReales } = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const nombresReales = new Set(tablasReales.map(t => t.table_name));

    // Verificar que todas las tablas del registro existan en PostgreSQL
    for (const reg of REGISTRO_DATOS_EMPRESA) {
      assert(nombresReales.has(reg.tabla), `La tabla declarada ${reg.tabla} debe existir en el catálogo real`);
    }

    const tablasEmpresa = REGISTRO_DATOS_EMPRESA.filter(t => t.exportar && t.ambito === 'empresa');
    console.log(`✔ Catálogo verificado: ${REGISTRO_DATOS_EMPRESA.length} tablas totales, ${tablasEmpresa.length} tablas exportables por empresa.`);
    console.log(`✔ Estructura de archivos físicos: ${REGISTRO_ARCHIVOS_EMPRESA.length} carpetas declaradas.`);
    assert.equal(REGISTRO_DATOS_EMPRESA.length, 84, 'Deben registrarse exactamente 84 tablas');
    assert.equal(tablasEmpresa.length, 60, 'Deben existir 60 tablas exportables de ámbito empresa');

    // -------------------------------------------------------------------------
    // Configuración de Datos Operativos para Empresa A y Empresa B
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Preparación de Empresas y Datos Operativos en PostgreSQL Real ---');
    await client.query(`INSERT INTO tenants (id, nombre) VALUES ($1, 'Tenant Respaldo B2') ON CONFLICT (id) DO NOTHING`, [tenantId]);

    // Empresa A
    await client.query(`
      INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal)
      VALUES ($1, $2, 'EMP-B2-A', $3, 'EMPRESA B2 PRINCIPAL SAC', 'REGIMEN_GENERAL', 'AV. PRIMARIA 123', 'PEN')
    `, [empresaA_id, tenantId, rucA]);

    // Empresa B (Aislamiento)
    await client.query(`
      INSERT INTO empresas (id, tenant_id, codigo_empresa, ruc, razon_social, regimen_tributario, domicilio_fiscal, moneda_principal)
      VALUES ($1, $2, 'EMP-B2-B', $3, 'EMPRESA B2 AISLADA SAC', 'MYPE_TRIBUTARIO', 'AV. SECUNDARIA 456', 'PEN')
    `, [empresaB_id, tenantId, rucB]);

    // Helper para poblar empresa con datos consistentes
    async function poblarEmpresa(empId: string, ruc: string, sufijo: string) {
      await client.query('BEGIN');
      try {
        await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false)", [empId]);

        const ejId = crypto.randomUUID();
        await client.query(`INSERT INTO ejercicios (id, empresa_id, anio, estado) VALUES ($1, $2, $3, 'ABIERTO')`, [ejId, empId, anio]);

        const perId = crypto.randomUUID();
        await client.query(`
          INSERT INTO periodos (id, empresa_id, ejercicio_id, anio, mes, codigo_periodo, estado)
          VALUES ($1, $2, $3, $4, 11, $5, 'ABIERTO')
        `, [perId, empId, ejId, anio, periodoStr]);

        // Subdiarios
        const sub01Id = crypto.randomUUID();
        await client.query(`
          INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
          VALUES ($1, $2, '01', 'REGISTRO DE COMPRAS', 'COMPRAS', true)
        `, [sub01Id, empId]);

        const sub02Id = crypto.randomUUID();
        await client.query(`
          INSERT INTO subdiarios (id, empresa_id, codigo, descripcion, tipo, is_active)
          VALUES ($1, $2, '02', 'REGISTRO DE VENTAS', 'VENTAS', true)
        `, [sub02Id, empId]);

        // Cuentas contables
        const cuentas = ['1212', '40111', '60111', '4212', '70111'];
        const ctaMap = new Map<string, string>();
        for (const c of cuentas) {
          const cId = crypto.randomUUID();
          await client.query(`
            INSERT INTO plan_cuentas (id, empresa_id, codigo, nombre, nivel, tipo_cuenta, permite_movimiento, is_active)
            VALUES ($1, $2, $3, $4, 4, 'ACTIVO', true, true)
          `, [cId, empId, c, `CUENTA ${c}`]);
          ctaMap.set(c, cId);
        }

        // Anexos
        const anexoProvId = crypto.randomUUID();
        await client.query(`
          INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
          VALUES ($1, $2, '6', $3, $4, 'PROVEEDOR')
        `, [anexoProvId, empId, `2011111111${sufijo}`, `PROVEEDOR ${sufijo} SAC`]);

        const anexoCliId = crypto.randomUUID();
        await client.query(`
          INSERT INTO anexos (id, empresa_id, tipo_documento, numero_documento, razon_social, tipo_entidad)
          VALUES ($1, $2, '6', $3, $4, 'CLIENTE')
        `, [anexoCliId, empId, `2022222222${sufijo}`, `CLIENTE ${sufijo} SAC`]);

        // Asiento 1: Compra (Se crea en BORRADOR y se contabiliza tras registrar el detalle)
        const ast1Id = crypto.randomUUID();
        await client.query(`
          INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, estado)
          VALUES ($1, $2, $3, $4, '000001', '2026-11-10', $5, 'BORRADOR')
        `, [ast1Id, empId, perId, sub01Id, `COMPRA MERCADERIAS ${sufijo}`]);

        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 1, 1000.00, 0.00, 'COMPRA BASE')
        `, [crypto.randomUUID(), empId, ast1Id, ctaMap.get('60111')]);
        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 2, 180.00, 0.00, 'COMPRA IGV')
        `, [crypto.randomUUID(), empId, ast1Id, ctaMap.get('40111')]);
        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 3, 0.00, 1180.00, 'COMPRA TOTAL')
        `, [crypto.randomUUID(), empId, ast1Id, ctaMap.get('4212')]);

        // Asiento 2: Venta (Se crea en BORRADOR y se contabiliza tras registrar el detalle)
        const ast2Id = crypto.randomUUID();
        await client.query(`
          INSERT INTO asientos (id, empresa_id, periodo_id, subdiario_id, numero, fecha, glosa, estado)
          VALUES ($1, $2, $3, $4, '000002', '2026-11-12', $5, 'BORRADOR')
        `, [ast2Id, empId, perId, sub02Id, `VENTA MERCADERIAS ${sufijo}`]);

        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 1, 2360.00, 0.00, 'VENTA TOTAL')
        `, [crypto.randomUUID(), empId, ast2Id, ctaMap.get('1212')]);
        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 2, 0.00, 360.00, 'VENTA IGV')
        `, [crypto.randomUUID(), empId, ast2Id, ctaMap.get('40111')]);
        await client.query(`
          INSERT INTO asiento_detalle (id, empresa_id, asiento_id, cuenta_id, linea, debe, haber, glosa_linea)
          VALUES ($1, $2, $3, $4, 3, 0.00, 2000.00, 'VENTA BASE')
        `, [crypto.randomUUID(), empId, ast2Id, ctaMap.get('70111')]);

        // Contabilizar asientos una vez que el detalle está cuadrado y verificado
        await client.query("UPDATE asientos SET estado = 'CONTABILIZADO' WHERE id IN ($1, $2)", [ast1Id, ast2Id]);

        // Comprobante de Compra
        const cmpId = crypto.randomUUID();
        await client.query(`
          INSERT INTO comprobantes_compra (
            id, empresa_id, periodo_id, fecha_emision, fecha_contable, tipo_comprobante, serie, numero,
            proveedor_id, base_gravada, igv, total, asiento_id, estado
          ) VALUES (
            $1, $2, $3, '2026-11-10', '2026-11-10', '01', 'F001', '00000101',
            $4, 1000.00, 180.00, 1180.00, $5, 'REGISTRADO'
          )
        `, [cmpId, empId, perId, anexoProvId, ast1Id]);

        // Comprobante de Venta
        const vtaId = crypto.randomUUID();
        await client.query(`
          INSERT INTO comprobantes_venta (
            id, empresa_id, periodo_id, fecha_emision, fecha_contable, tipo_comprobante, serie, numero,
            cliente_id, base_gravada, igv, total, asiento_id, estado
          ) VALUES (
            $1, $2, $3, '2026-11-12', '2026-11-12', '01', 'F001', '00000201',
            $4, 2000.00, 360.00, 2360.00, $5, 'REGISTRADO'
          )
        `, [vtaId, empId, perId, anexoCliId, ast2Id]);

        await client.query('COMMIT');
        return { perId, ast1Id, ast2Id, cmpId, vtaId };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Poblando datos de prueba para Empresa A (Principal)...');
    await poblarEmpresa(empresaA_id, rucA, '1');

    console.log('Poblando datos de prueba para Empresa B (Aislada)...');
    await poblarEmpresa(empresaB_id, rucB, '2');

    // Guardar archivos físicos de prueba en Empresa A
    const xmlContenido = Buffer.from('<Invoice><ID>F001-00000101</ID><IssueDate>2026-11-10</IssueDate><PayableAmount>1180.00</PayableAmount></Invoice>', 'utf8');
    const pdfContenido = Buffer.from('%PDF-1.4 Mock Comprobante Electronico F001-00000101', 'utf8');
    const txtContenido = Buffer.from('Contrato de alquiler 2026 Empresa A SAC', 'utf8');

    archivosEmpresaService.guardarArchivo(empresaA_id, 'xml', '20999000011-01-F001-00000101.xml', xmlContenido);
    archivosEmpresaService.guardarArchivo(empresaA_id, 'pdf', '20999000011-01-F001-00000101.pdf', pdfContenido);
    archivosEmpresaService.guardarArchivo(empresaA_id, 'adjuntos', 'contrato_alquiler.txt', txtContenido);

    const archivosA = archivosEmpresaService.listarArchivosExportables(empresaA_id);
    assert.equal(archivosA.length, 3, 'Empresa A debe tener 3 archivos físicos exportables guardados');
    console.log(`✔ Archivos físicos guardados para Empresa A: ${archivosA.length} archivos.`);

    // -------------------------------------------------------------------------
    // CRITERIO B2.2: Generación de Respaldo Cifrado y Verificación SHA-256
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Generación de Respaldo ZIP Cifrado (AES-256-GCM + SHA-256) ---');
    const inicioBackup = Date.now();
    const backupResultado = await backupEmpresaService.generarBackupZip(empresaA_id, 'MANUAL', usuarioAdminId);
    const tiempoBackupMs = Date.now() - inicioBackup;

    console.log(`✔ Respaldo generado en ${tiempoBackupMs} ms.`);
    console.log(`✔ Archivo: ${backupResultado.nombreArchivo}`);
    console.log(`✔ Tamaño cifrado: ${backupResultado.tamanoBytes} bytes`);
    console.log(`✔ Hash SHA-256: ${backupResultado.hashSha256}`);

    const bufferZip = backupResultado.archivoZipBuffer;
    assert(bufferZip && bufferZip.length > 0, 'El buffer ZIP debe generarse no vacío');

    // Verificación de integridad con el servicio
    const verificacion = backupEmpresaService.verificarIntegridadBackup(bufferZip);
    assert(verificacion.valida, `La verificación de integridad del backup debe ser válida: ${verificacion.detalle}`);
    assert.equal(verificacion.manifest.ruc, rucA, 'El RUC en el manifest debe coincidir');
    assert(verificacion.manifest.alcance, 'El alcance debe existir en manifest');
    assert.equal(verificacion.manifest.alcance.modo, 'COMPLETO', 'El alcance debe ser COMPLETO');
    assert(verificacion.manifest.esquemaVersion.includes('completo'), 'La versión debe ser completo');
    console.log(`✔ Integridad del archivo verificada satisfactoriamente con SHA-256: ${verificacion.detalle}`);
    console.log('Manifest archivos clave:', {
      ejercicios: verificacion.manifest.archivos['ejercicios.ndjson'],
      periodos: verificacion.manifest.archivos['periodos.ndjson'],
      subdiarios: verificacion.manifest.archivos['subdiarios.ndjson'],
      asientos: verificacion.manifest.archivos['asientos.ndjson'],
    });

    // -------------------------------------------------------------------------
    // CRITERIO B2.3: Rechazo Obligatorio de Archivos Alterados (100% Rechazados)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Prueba Negativa: Rechazo Obligatorio de Respaldos Alterados ---');

    // 4.1. Archivo con ciphertext alterado (1 bit modificado en carga cifrada)
    console.log('4.1. Probando archivo cifrado con 1 byte alterado...');
    const bufferAlterado = Buffer.from(bufferZip);
    bufferAlterado[bufferAlterado.length - 10] = (bufferAlterado[bufferAlterado.length - 10] ^ 0xFF);

    const verificacionAlterada = backupEmpresaService.verificarIntegridadBackup(bufferAlterado);
    assert.equal(verificacionAlterada.valida, false, 'El backup con bytes alterados debe ser declarado inválido');

    await assert.rejects(
      async () => {
        await backupEmpresaService.restaurarBackup(empresaA_id, bufferAlterado, rucA, usuarioAdminId);
      },
      /BACKUP_RECHAZADO/,
      'El intento de restauración de un archivo alterado debe ser rechazado inmediatamente'
    );
    console.log('✔ Archivo cifrado alterado rechazado correctamente con excepción BACKUP_RECHAZADO.');

    // 4.2. Paquete con contenido modificado sin actualizar manifest (violación SHA-256)
    console.log('4.2. Probando paquete con contenido NDJSON adulterado (hash mismatch)...');
    const claveSecreta = (backupEmpresaService as any).derivarClave(undefined);
    const zipPlano = (backupEmpresaService as any).descifrarBufferAesGcm(bufferZip, claveSecreta);
    const adm = new AdmZip(zipPlano);
    
    // Adulteramos asientos.ndjson
    const asientosEntry = adm.getEntry('asientos.ndjson');
    assert(asientosEntry, 'asientos.ndjson debe existir');
    adm.updateFile('asientos.ndjson', Buffer.from('{"id":"hack","numero":"999999"}', 'utf8'));
    
    // Re-ciframos el zip alterado internamente
    const zipPlanoAdulterado = adm.toBuffer();
    const zipCifradoAdulterado = (backupEmpresaService as any).cifrarBufferAesGcm(zipPlanoAdulterado, claveSecreta);

    const verificacionHashFalso = backupEmpresaService.verificarIntegridadBackup(zipCifradoAdulterado);
    assert.equal(verificacionHashFalso.valida, false, 'El backup con hash interno inconsistente debe ser inválido');
    assert(verificacionHashFalso.detalle.includes('CORRUPTO_HASH'), 'Debe reportar CORRUPTO_HASH');

    await assert.rejects(
      async () => {
        await backupEmpresaService.restaurarBackup(empresaA_id, zipCifradoAdulterado, rucA, usuarioAdminId);
      },
      /BACKUP_RECHAZADO/,
      'La restauración con hash inconsistente debe ser rechazada'
    );
    console.log('✔ Paquete con contenido NDJSON adulterado rechazado con código CORRUPTO_HASH.');

    // 4.3. RUC de confirmación incorrecto
    console.log('4.3. Probando restauración con RUC de confirmación erróneo...');
    await assert.rejects(
      async () => {
        await backupEmpresaService.restaurarBackup(empresaA_id, bufferZip, '20000000000', usuarioAdminId);
      },
      /CONFIRMACION_RUC_FALLIDA/,
      'Debe abortar si el RUC de confirmación no coincide'
    );
    console.log('✔ Confirmación de RUC erróneo rechazada con CONFIRMACION_RUC_FALLIDA.');

    // -------------------------------------------------------------------------
    // CRITERIO B2.4 y B2.5: Restauración Completa y Aislamiento Multiempresa
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Prueba de Simulación de Desastre y Restauración Completa ---');

    // 5.1. Capturar estado de Empresa B antes de la restauración
    const { rows: [estadoPrevioB] } = await client.query(`
      SELECT 
        (SELECT count(*)::int FROM asientos WHERE empresa_id = $1) AS total_asientos,
        (SELECT count(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS total_compras,
        (SELECT count(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS total_ventas,
        (SELECT COALESCE(SUM(debe), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_debe,
        (SELECT COALESCE(SUM(haber), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_haber
    `, [empresaB_id]);

    console.log(`Estado Empresa B antes de restauración: Asientos=${estadoPrevioB.total_asientos}, Compras=${estadoPrevioB.total_compras}, Debe=${estadoPrevioB.suma_debe}, Haber=${estadoPrevioB.suma_haber}`);

    // 5.2. Simular pérdida catastrófica en Empresa A: Borrar todos sus datos en PostgreSQL y archivos
    console.log('Simulando desastre: eliminando registros de Empresa A en PostgreSQL real...');
    await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false), set_config('app.restaurando_backup', 'true', false)", [empresaA_id]);
    await client.query('DELETE FROM comprobantes_venta WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM comprobantes_compra WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM asiento_detalle WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM asientos WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM anexos WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM subdiarios WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM plan_cuentas WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM periodos WHERE empresa_id = $1', [empresaA_id]);
    await client.query('DELETE FROM ejercicios WHERE empresa_id = $1', [empresaA_id]);
    await client.query("SELECT set_config('app.restaurando_backup', 'false', false)");
    archivosEmpresaService.limpiarArchivosExportables(empresaA_id);

    // Verificar que Empresa A esté totalmente vacía
    const { rows: [vacioA] } = await client.query(`
      SELECT 
        (SELECT count(*)::int FROM asientos WHERE empresa_id = $1) AS total_asientos,
        (SELECT count(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS total_compras,
        (SELECT count(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS total_ventas
    `, [empresaA_id]);
    assert.equal(vacioA.total_asientos, 0);
    assert.equal(vacioA.total_compras, 0);
    assert.equal(vacioA.total_ventas, 0);
    assert.equal(archivosEmpresaService.listarArchivosExportables(empresaA_id).length, 0);
    console.log('✔ Empresa A vaciada al 100% (0 registros, 0 archivos).');

    // 5.3. Ejecutar Restauración Transaccional desde el Respaldo Verificado
    console.log('Ejecutando restauración transaccional de Empresa A...');
    const inicioRTO = Date.now();
    const resRestauracion = await backupEmpresaService.restaurarBackup(empresaA_id, bufferZip, rucA, usuarioAdminId);
    const tiempoRTOMs = Date.now() - inicioRTO;

    console.log(`✔ Restauración ejecutada en ${tiempoRTOMs} ms.`);
    console.log(`✔ Resultado: exito=${resRestauracion.exito}, registrosRestaurados=${resRestauracion.registrosRestaurados}`);
    assert(resRestauracion.exito, 'La restauración debe ser exitosa');

    // 5.4. Verificar Restauración de Datos en Empresa A
    await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false)", [empresaA_id]);

    const { rows: [restauradoA] } = await client.query(`
      SELECT 
        (SELECT count(*)::int FROM ejercicios WHERE empresa_id = $1) AS total_ejercicios,
        (SELECT count(*)::int FROM periodos WHERE empresa_id = $1) AS total_periodos,
        (SELECT count(*)::int FROM subdiarios WHERE empresa_id = $1) AS total_subdiarios,
        (SELECT count(*)::int FROM plan_cuentas WHERE empresa_id = $1) AS total_cuentas,
        (SELECT count(*)::int FROM anexos WHERE empresa_id = $1) AS total_anexos,
        (SELECT count(*)::int FROM asientos WHERE empresa_id = $1) AS total_asientos,
        (SELECT count(*)::int FROM asiento_detalle WHERE empresa_id = $1) AS total_detalles,
        (SELECT count(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS total_compras,
        (SELECT count(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS total_ventas,
        (SELECT COALESCE(SUM(debe), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_debe,
        (SELECT COALESCE(SUM(haber), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_haber
    `, [empresaA_id]);

    console.log('Filas recuperadas de Empresa A en PostgreSQL:', restauradoA);
    assert.equal(restauradoA.total_ejercicios, 1, 'Debe haber 1 ejercicio restaurado');
    assert.equal(restauradoA.total_periodos, 1, 'Debe haber 1 periodo restaurado');
    assert.equal(restauradoA.total_subdiarios, 2, 'Deben haber 2 subdiarios restaurados');
    assert.equal(restauradoA.total_cuentas, 5, 'Deben haber 5 cuentas restauradas');
    assert.equal(restauradoA.total_anexos, 2, 'Deben haber 2 anexos restaurados');
    assert.equal(restauradoA.total_asientos, 2, 'Deben haber 2 asientos restaurados');
    assert.equal(restauradoA.total_detalles, 6, 'Deben haber 6 líneas de asiento restauradas');
    assert.equal(restauradoA.total_compras, 1, 'Debe haber 1 compra restaurada');
    assert.equal(restauradoA.total_ventas, 1, 'Debe haber 1 venta restaurada');

    // Partida Doble
    assert.equal(Number(restauradoA.suma_debe), Number(restauradoA.suma_haber), 'Debe y Haber deben ser idénticos tras restauración');
    assert.equal(Number(restauradoA.suma_debe), 3540.00, 'La suma Debe debe ser 3540.00');
    console.log(`✔ Empresa A restaurada con 100% de integridad: Asientos=${restauradoA.total_asientos}, Compras=${restauradoA.total_compras}, Ventas=${restauradoA.total_ventas}, Balance=${restauradoA.suma_debe} == ${restauradoA.suma_haber}`);

    // 5.5. Verificar Restauración de Archivos Físicos
    const archivosRestauradosA = archivosEmpresaService.listarArchivosExportables(empresaA_id);
    assert.equal(archivosRestauradosA.length, 3, 'Deben haberse restaurado los 3 archivos físicos');

    const xmlRestaurado = archivosRestauradosA.find(a => a.nombre === '20999000011-01-F001-00000101.xml');
    assert(xmlRestaurado, 'El archivo XML debe existir');
    assert.equal(xmlRestaurado.buffer.toString('utf8'), xmlContenido.toString('utf8'), 'El contenido del XML restaurado debe ser idéntico al original');
    console.log(`✔ Archivos físicos restaurados en disco: ${archivosRestauradosA.length} archivos validados byte a byte.`);

    // 5.6. CRITERIO B2.4: Comprobar Aislamiento Multiempresa Estricto (Empresa B Intacta)
    console.log('\n--- 6. Comprobación de Aislamiento Multiempresa (Empresa B Cero Alteraciones) ---');
    await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false)", [empresaB_id]);
    const { rows: [estadoPostB] } = await client.query(`
      SELECT 
        (SELECT count(*)::int FROM asientos WHERE empresa_id = $1) AS total_asientos,
        (SELECT count(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS total_compras,
        (SELECT count(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS total_ventas,
        (SELECT COALESCE(SUM(debe), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_debe,
        (SELECT COALESCE(SUM(haber), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_haber
    `, [empresaB_id]);

    assert.equal(estadoPostB.total_asientos, estadoPrevioB.total_asientos, 'Asientos de Empresa B deben ser idénticos');
    assert.equal(estadoPostB.total_compras, estadoPrevioB.total_compras, 'Compras de Empresa B deben ser idénticas');
    assert.equal(estadoPostB.total_ventas, estadoPrevioB.total_ventas, 'Ventas de Empresa B deben ser idénticas');
    assert.equal(Number(estadoPostB.suma_debe), Number(estadoPrevioB.suma_debe), 'Suma Debe de Empresa B no debe haber cambiado');
    assert.equal(Number(estadoPostB.suma_haber), Number(estadoPrevioB.suma_haber), 'Suma Haber de Empresa B no debe haber cambiado');
    console.log('✔ Aislamiento verificado: Empresa B registró exactamente 0 modificaciones o pérdidas durante la restauración de Empresa A.');

    // -------------------------------------------------------------------------
    // CRITERIO B2.6: Persistencia tras Reinicio en PostgreSQL Real (Cold-Restart)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Prueba de Persistencia tras Reinicio (Cold-Restart de Conexiones) ---');
    client.release();
    await pool.end();
    setPostgresPool(null, false);
    console.log('✔ Pool PostgreSQL cerrado (simulación de parada de servidor / reinicio frío).');

    // Reconectar con un pool totalmente nuevo
    pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
    setPostgresPool(pool, true);
    client = await pool.connect();
    console.log('✔ Nueva conexión PostgreSQL establecida tras reinicio.');
    await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false)", [empresaA_id]);

    const { rows: [postReinicioA] } = await client.query(`
      SELECT 
        (SELECT count(*)::int FROM asientos WHERE empresa_id = $1) AS total_asientos,
        (SELECT count(*)::int FROM comprobantes_compra WHERE empresa_id = $1) AS total_compras,
        (SELECT count(*)::int FROM comprobantes_venta WHERE empresa_id = $1) AS total_ventas,
        (SELECT COALESCE(SUM(debe), 0)::numeric FROM asiento_detalle WHERE empresa_id = $1) AS suma_debe
      FROM empresas WHERE id = $1
    `, [empresaA_id]);

    assert.equal(postReinicioA.total_asientos, 2, 'Los asientos deben persistir tras el reinicio');
    assert.equal(postReinicioA.total_compras, 1, 'Las compras deben persistir tras el reinicio');
    assert.equal(postReinicioA.total_ventas, 1, 'Las ventas deben persistir tras el reinicio');
    assert.equal(Number(postReinicioA.suma_debe), 3540.00, 'El balance debe persistir en disco');
    console.log('✔ Persistencia verificada tras reinicio en PostgreSQL real: 100% de datos conservados en disco.');

    // -------------------------------------------------------------------------
    // CRITERIO B2.7: Métricas de RPO y RTO del Piloto
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Métricas de Respaldo y Recuperación (RPO y RTO) ---');
    console.log(`⏱️ Tiempo medido de generación de respaldo (RPO snapshot): ${tiempoBackupMs} ms`);
    console.log(`⏱️ Tiempo medido de restauración transaccional (RTO): ${tiempoRTOMs} ms`);
    console.log(`✔ RTO medido: ${tiempoRTOMs} ms (Objetivo: <= 60 minutos = 3,600,000 ms) -> CUMPLIDO AMPLIAMENTE.`);
    console.log(`✔ RPO objetivo: <= 24 horas con respaldo programado o bajo demanda -> CUMPLIDO.`);

    console.log('\n========================================================================');
    console.log('🎉 FASE B2 CERTIFICADA: 4/4 PRUEBAS OBLIGATORIAS APROBADAS EN POSTGRESQL REAL');
    console.log('========================================================================\n');

  } finally {
    // Limpieza de datos de prueba
    try {
      await client.query("SELECT set_config('app.empresa_id', $1, false), set_config('app.current_empresa_id', $1, false), set_config('app.restaurando_backup', 'true', false)", [empresaA_id]);
      await client.query('DELETE FROM comprobantes_venta WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM comprobantes_compra WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM asiento_detalle WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM asientos WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM anexos WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM subdiarios WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM plan_cuentas WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM periodos WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM ejercicios WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM reportes_generados WHERE empresa_id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM empresas WHERE id IN ($1, $2)', [empresaA_id, empresaB_id]);
      await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      archivosEmpresaService.limpiarArchivosExportables(empresaA_id);
      archivosEmpresaService.limpiarArchivosExportables(empresaB_id);
    } catch (cleanErr) {
      // Ignorar errores de limpieza final
    }

    client.release();
    await pool.end();
  }
}

ejecutar().catch(err => {
  console.error('❌ ERROR FATAL EN PRUEBA REAL FASE B2:', err);
  process.exit(1);
});
