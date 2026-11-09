import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface EscenarioFila {
  id: string;
  subdiarioNumero: string;
  subdiarioNombre: string;
  interfaz: string;
  backend: string;
  prueba: string;
  estado: string;
}

interface ResumenFila {
  subdiario: string;
  total: number;
  pgReal: number;
  memoria: number;
  sinPrueba: number;
  parcial: number;
  noImplementado: number;
}

export function verificarMatriz() {
  console.log('========================================================================');
  console.log('🔍 VERIFICACIÓN DE INTEGRIDAD Y TRAZABILIDAD: MATRIZ DE COMPLETITUD');
  console.log('========================================================================\n');

  const rutaMatriz = resolve(process.cwd(), 'docs/MATRIZ_COMPLETITUD_ASIENTOS.md');
  if (!existsSync(rutaMatriz)) {
    console.error(`❌ No existe el archivo de matriz en ${rutaMatriz}`);
    process.exit(1);
  }

  const contenido = readFileSync(rutaMatriz, 'utf8');
  const lineas = contenido.split(/\r?\n/);

  const errores: string[] = [];
  const escenarios: EscenarioFila[] = [];
  let subdiarioActualNumero = '';
  let subdiarioActualNombre = '';

  // 1. Parsear escenarios por subdiario
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();

    // Detección de encabezado de subdiario
    const matchSubdiario = linea.match(/^###\s+Subdiario\s+(\d{2}):\s+(.+)$/);
    if (matchSubdiario) {
      subdiarioActualNumero = matchSubdiario[1];
      subdiarioActualNombre = matchSubdiario[2];
      continue;
    }

    // Detección de fila de escenario
    if (linea.startsWith('|') && linea.includes('**ESC-')) {
      const columnas = linea.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (columnas.length < 9) {
        errores.push(`Línea ${i + 1}: Fila de escenario con formato de columnas incompleto (${columnas.length} columnas).`);
        continue;
      }

      const rawId = columnas[0];
      const matchId = rawId.match(/ESC-[A-Z0-9.-]+/);
      if (!matchId) {
        errores.push(`Línea ${i + 1}: No se pudo extraer ID de escenario de '${rawId}'.`);
        continue;
      }

      const id = matchId[0];
      const interfaz = columnas[3];
      const backend = columnas[4];
      const prueba = columnas[6];
      const estado = columnas[8].replace(/`/g, '').trim();

      escenarios.push({
        id,
        subdiarioNumero: subdiarioActualNumero,
        subdiarioNombre: subdiarioActualNombre,
        interfaz,
        backend,
        prueba,
        estado,
      });
    }
  }

  console.log(`📋 Total de escenarios leídos en la matriz: ${escenarios.length}`);

  // 2. Verificación de archivos citados (existencia en disco)
  const regexArchivos = /(?:src|server|docs|scripts)\/[A-Za-z0-9_./-]+\.(?:tsx|ts|sql|csv|json|md)/g;
  const archivosVerificados = new Set<string>();

  for (const esc of escenarios) {
    const textoCompleto = `${esc.interfaz} ${esc.backend} ${esc.prueba}`;
    const matches = textoCompleto.match(regexArchivos) || [];

    for (const match of matches) {
      const rutaNormalizada = match.trim();
      const rutaAbsoluta = resolve(process.cwd(), rutaNormalizada);
      if (!existsSync(rutaAbsoluta)) {
        errores.push(`[${esc.id}] Archivo citado no existe en disco: '${rutaNormalizada}'`);
      } else {
        archivosVerificados.add(rutaNormalizada);
      }
    }
  }
  console.log(`📁 Archivos fuente citados verificados en disco: ${archivosVerificados.size}`);

  // 3. Verificación de presencia del ID en las pruebas automatizadas
  const cacheContenidoPruebas = new Map<string, string>();
  let escenariosProbadosValidados = 0;

  for (const esc of escenarios) {
    if (esc.estado.includes('PROBADO')) {
      const testFiles = esc.prueba.match(/(?:server\/tests)\/[A-Za-z0-9_./-]+\.ts/g) || [];
      if (testFiles.length === 0) {
        errores.push(`[${esc.id}] Tiene estado '${esc.estado}' pero no cita ningún archivo de prueba bajo server/tests/`);
        continue;
      }

      let idEncontrado = false;
      for (const tFile of testFiles) {
        let content = cacheContenidoPruebas.get(tFile);
        if (content === undefined) {
          const rutaT = resolve(process.cwd(), tFile);
          if (existsSync(rutaT)) {
            content = readFileSync(rutaT, 'utf8');
            cacheContenidoPruebas.set(tFile, content);
          } else {
            content = '';
          }
        }

        if (content.includes(esc.id)) {
          idEncontrado = true;
          break;
        }
      }

      if (!idEncontrado) {
        errores.push(`[${esc.id}] ID de escenario no encontrado en el código del archivo de prueba citado: ${testFiles.join(', ')}`);
      } else {
        escenariosProbadosValidados++;
      }
    }
  }
  console.log(`🧪 Escenarios con etiqueta PROBADO validados con ID en suite: ${escenariosProbadosValidados}`);

  // 4. Verificación de la tabla de resumen cuantitativo
  let enSeccionResumen = false;
  const resumenFilas: ResumenFila[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (linea.includes('## 4. Resumen Cuantitativo')) {
      enSeccionResumen = true;
      continue;
    }

    if (enSeccionResumen && linea.startsWith('|') && linea.includes('**')) {
      const col = linea.split('|').map(c => c.trim().replace(/\*\*/g, '').replace(/`/g, '')).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (col.length >= 7 && (col[0].match(/^\d{2}\s+/) || col[0] === 'TOTAL GENERAL')) {
        resumenFilas.push({
          subdiario: col[0],
          total: Number.parseInt(col[1], 10) || 0,
          pgReal: Number.parseInt(col[2], 10) || 0,
          memoria: Number.parseInt(col[3], 10) || 0,
          sinPrueba: Number.parseInt(col[4], 10) || 0,
          parcial: Number.parseInt(col[5], 10) || 0,
          noImplementado: Number.parseInt(col[6], 10) || 0,
        });
      }
    }
  }

  if (resumenFilas.length !== 9) { // 8 subdiarios + TOTAL GENERAL
    errores.push(`La tabla de resumen debe contener exactamente 8 filas de subdiarios más TOTAL GENERAL (encontradas: ${resumenFilas.length})`);
  } else {
    // Verificar cada subdiario
    for (let s = 1; s <= 8; s++) {
      const numStr = s.toString().padStart(2, '0');
      const escDelSub = escenarios.filter(e => e.subdiarioNumero === numStr);
      const filaResumen = resumenFilas.find(r => r.subdiario.startsWith(numStr));

      if (!filaResumen) {
        errores.push(`Falta la fila del subdiario ${numStr} en la tabla de resumen.`);
        continue;
      }

      const totalReal = escDelSub.length;
      const pgReal = escDelSub.filter(e => e.estado === 'IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL').length;
      const memoria = escDelSub.filter(e => e.estado === 'PROBADO CON MOTOR EN MEMORIA' || e.estado === 'PROBADO SOLO EN pg-mem').length;
      const sinPrueba = escDelSub.filter(e => e.estado === 'IMPLEMENTADO SIN PRUEBA').length;
      const parcial = escDelSub.filter(e => e.estado === 'PARCIAL').length;
      const noImplementado = escDelSub.filter(e => e.estado === 'NO IMPLEMENTADO').length;

      if (filaResumen.total !== totalReal) {
        errores.push(`Subdiario ${numStr}: Total en resumen (${filaResumen.total}) != filas reales (${totalReal})`);
      }
      if (filaResumen.pgReal !== pgReal) {
        errores.push(`Subdiario ${numStr}: PG Real en resumen (${filaResumen.pgReal}) != filas reales (${pgReal})`);
      }
      if (filaResumen.memoria !== memoria) {
        errores.push(`Subdiario ${numStr}: Memoria en resumen (${filaResumen.memoria}) != filas reales (${memoria})`);
      }
      if (filaResumen.sinPrueba !== sinPrueba) {
        errores.push(`Subdiario ${numStr}: Sin Prueba en resumen (${filaResumen.sinPrueba}) != filas reales (${sinPrueba})`);
      }
      if (filaResumen.parcial !== parcial) {
        errores.push(`Subdiario ${numStr}: Parcial en resumen (${filaResumen.parcial}) != filas reales (${parcial})`);
      }
      if (filaResumen.noImplementado !== noImplementado) {
        errores.push(`Subdiario ${numStr}: No Implementado en resumen (${filaResumen.noImplementado}) != filas reales (${noImplementado})`);
      }
    }

    // Verificar fila TOTAL GENERAL
    const totalFila = resumenFilas.find(r => r.subdiario === 'TOTAL GENERAL');
    if (totalFila) {
      const sumTotal = escenarios.length;
      const sumMemoria = escenarios.filter(e => e.estado === 'PROBADO CON MOTOR EN MEMORIA' || e.estado === 'PROBADO SOLO EN pg-mem').length;
      const sumParcial = escenarios.filter(e => e.estado === 'PARCIAL').length;
      const sumNoImpl = escenarios.filter(e => e.estado === 'NO IMPLEMENTADO').length;

      if (totalFila.total !== sumTotal) {
        errores.push(`TOTAL GENERAL: Total (${totalFila.total}) != suma de escenarios (${sumTotal})`);
      }
      if (totalFila.memoria !== sumMemoria) {
        errores.push(`TOTAL GENERAL: Memoria (${totalFila.memoria}) != suma memoria (${sumMemoria})`);
      }
      if (totalFila.parcial !== sumParcial) {
        errores.push(`TOTAL GENERAL: Parcial (${totalFila.parcial}) != suma parcial (${sumParcial})`);
      }
      if (totalFila.noImplementado !== sumNoImpl) {
        errores.push(`TOTAL GENERAL: No Implementado (${totalFila.noImplementado}) != suma no implementado (${sumNoImpl})`);
      }
    }
  }

  // 5. Resultado final
  if (errores.length > 0) {
    console.error('\n❌ SE ENCONTRARON DISCREPANCIAS O ERRORES EN LA MATRIZ DE COMPLETITUD:');
    errores.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('✅ MATRIZ DE COMPLETITUD 100% VERIFICADA Y SIN DISCREPANCIAS');
  console.log('========================================================================\n');
}

if (process.argv[1]?.endsWith('verificar-matriz.ts')) {
  verificarMatriz();
}
