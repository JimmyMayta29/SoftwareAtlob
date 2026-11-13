import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface EscenarioFila {
  id: string;
  subdiarioNumero: string;
  subdiarioNombre: string;
  interfaz: string;
  backend: string;
  prueba: string;
  estado: string;
  archivoTest?: string;
  lineaTest?: number;
  asercionesContadas?: number;
}

export interface ResumenFila {
  subdiario: string;
  total: number;
  pgReal: number;
  memoria: number;
  sinPrueba: number;
  parcial: number;
  noImplementado: number;
}

export interface ResultadoVerificacion {
  valido: boolean;
  totalEscenarios: number;
  archivosVerificados: number;
  escenariosProbadosValidados: number;
  asercionesTotalesContadas: number;
  errores: string[];
}

export function ejecutarVerificacionMatriz(
  contenidoMatrizPersonalizado?: string,
  anularArchivosParaTest?: string[]
): ResultadoVerificacion {
  const errores: string[] = [];
  const rutaMatriz = resolve(process.cwd(), 'docs/MATRIZ_COMPLETITUD_ASIENTOS.md');

  let contenido = contenidoMatrizPersonalizado;
  if (!contenido) {
    if (!existsSync(rutaMatriz)) {
      return {
        valido: false,
        totalEscenarios: 0,
        archivosVerificados: 0,
        escenariosProbadosValidados: 0,
        asercionesTotalesContadas: 0,
        errores: [`No existe el archivo de matriz en ${rutaMatriz}`]
      };
    }
    contenido = readFileSync(rutaMatriz, 'utf8');
  }

  const lineas = contenido.split(/\r?\n/);
  const escenarios: EscenarioFila[] = [];
  let subdiarioActualNumero = '';
  let subdiarioActualNombre = '';

  // 1. Parsear filas de escenarios
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    const matchSubdiario = linea.match(/^###\s+Subdiario\s+(\d{2}):\s+(.+)$/);
    if (matchSubdiario) {
      subdiarioActualNumero = matchSubdiario[1];
      subdiarioActualNombre = matchSubdiario[2];
      continue;
    }

    if (linea.startsWith('|') && linea.includes('**ESC-')) {
      const columnas = linea.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (columnas.length < 9) {
        errores.push(`Línea ${i + 1}: Columnas incompletas (${columnas.length} columnas).`);
        continue;
      }

      const matchId = columnas[0].match(/ESC-[A-Z0-9.-]+/);
      if (!matchId) {
        errores.push(`Línea ${i + 1}: No se pudo extraer ID de escenario de '${columnas[0]}'.`);
        continue;
      }

      escenarios.push({
        id: matchId[0],
        subdiarioNumero: subdiarioActualNumero,
        subdiarioNombre: subdiarioActualNombre,
        interfaz: columnas[3],
        backend: columnas[4],
        prueba: columnas[6],
        estado: columnas[8].replace(/`/g, '').trim(),
      });
    }
  }

  // 2. Verificación de archivos citados en disco
  const regexArchivos = /(?:src|server|docs|scripts)\/[A-Za-z0-9_./-]+\.(?:tsx|ts|sql|csv|json|md)/g;
  const archivosVerificados = new Set<string>();

  for (const esc of escenarios) {
    const textoCompleto = `${esc.interfaz} ${esc.backend} ${esc.prueba}`;
    const matches = textoCompleto.match(regexArchivos) || [];

    for (const match of matches) {
      const rutaNormalizada = match.trim();
      const esAnulado = anularArchivosParaTest?.includes(rutaNormalizada);
      const rutaAbsoluta = resolve(process.cwd(), rutaNormalizada);

      if (esAnulado || !existsSync(rutaAbsoluta)) {
        errores.push(`[${esc.id}] Archivo citado no existe en disco: '${rutaNormalizada}'`);
      } else {
        archivosVerificados.add(rutaNormalizada);
      }
    }
  }

  // 3. Verificación de aserciones en pruebas para escenarios PROBADO
  const cacheContenidoPruebas = new Map<string, string[]>();
  let escenariosProbadosValidados = 0;
  let asercionesTotalesContadas = 0;

  for (const esc of escenarios) {
    if (esc.estado.includes('PROBADO')) {
      const testFiles = esc.prueba.match(/(?:server\/tests)\/[A-Za-z0-9_./-]+\.ts/g) || [];
      if (testFiles.length === 0) {
        errores.push(`[${esc.id}] Tiene estado '${esc.estado}' pero no cita ningún archivo de prueba bajo server/tests/`);
        continue;
      }

      let idEncontrado = false;
      let totalAsercionesEscenario = 0;

      for (const tFile of testFiles) {
        let lineasTest = cacheContenidoPruebas.get(tFile);
        if (!lineasTest) {
          const rutaT = resolve(process.cwd(), tFile);
          if (existsSync(rutaT)) {
            lineasTest = readFileSync(rutaT, 'utf8').split(/\r?\n/);
            cacheContenidoPruebas.set(tFile, lineasTest);
          } else {
            lineasTest = [];
          }
        }

        // Buscar el ID en las líneas del test
        for (let idx = 0; idx < lineasTest.length; idx++) {
          if (lineasTest[idx].includes(esc.id)) {
            idEncontrado = true;
            esc.archivoTest = tFile;
            esc.lineaTest = idx + 1;

            // Escanear bloque de prueba subsiguiente (hasta 60 líneas)
            const bloque = lineasTest.slice(idx, Math.min(lineasTest.length, idx + 60));
            let conteoBloque = 0;
            const regexAsercion = /\b(?:assert(?:\.[a-zA-Z]+)?|expect)\s*\(/;
            for (const l of bloque) {
              if (regexAsercion.test(l)) {
                conteoBloque++;
              }
            }

            totalAsercionesEscenario += conteoBloque;
            break;
          }
        }

        if (idEncontrado) break;
      }

      if (!idEncontrado) {
        errores.push(`[${esc.id}] ID de escenario no encontrado en el código del archivo de prueba citado: ${testFiles.join(', ')}`);
      } else if (totalAsercionesEscenario === 0) {
        errores.push(`[${esc.id}] Encontrado en ${esc.archivoTest}:${esc.lineaTest} pero el bloque NO contiene aserciones reales (assert/expect).`);
      } else {
        esc.asercionesContadas = totalAsercionesEscenario;
        asercionesTotalesContadas += totalAsercionesEscenario;
        escenariosProbadosValidados++;
      }
    }
  }

  // 4. Verificación de la tabla de resumen
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

  if (resumenFilas.length !== 9) {
    errores.push(`La tabla de resumen debe contener exactamente 8 filas de subdiarios más TOTAL GENERAL (encontradas: ${resumenFilas.length})`);
  } else {
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
      if (filaResumen.parcial !== parcial) {
        errores.push(`Subdiario ${numStr}: Parcial en resumen (${filaResumen.parcial}) != filas reales (${parcial})`);
      }
      if (filaResumen.noImplementado !== noImplementado) {
        errores.push(`Subdiario ${numStr}: No Implementado en resumen (${filaResumen.noImplementado}) != filas reales (${noImplementado})`);
      }
    }

    const totalFila = resumenFilas.find(r => r.subdiario === 'TOTAL GENERAL');
    if (totalFila) {
      const sumTotal = escenarios.length;
      const sumPgReal = escenarios.filter(e => e.estado === 'IMPLEMENTADO Y PROBADO EN POSTGRESQL REAL').length;
      const sumMemoria = escenarios.filter(e => e.estado === 'PROBADO CON MOTOR EN MEMORIA' || e.estado === 'PROBADO SOLO EN pg-mem').length;
      const sumParcial = escenarios.filter(e => e.estado === 'PARCIAL').length;
      const sumNoImpl = escenarios.filter(e => e.estado === 'NO IMPLEMENTADO').length;

      if (totalFila.total !== sumTotal) {
        errores.push(`TOTAL GENERAL: Total (${totalFila.total}) != suma de escenarios (${sumTotal})`);
      }
      if (totalFila.pgReal !== sumPgReal) {
        errores.push(`TOTAL GENERAL: PostgreSQL Real (${totalFila.pgReal}) != suma pgReal (${sumPgReal})`);
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

  return {
    valido: errores.length === 0,
    totalEscenarios: escenarios.length,
    archivosVerificados: archivosVerificados.size,
    escenariosProbadosValidados,
    asercionesTotalesContadas,
    errores
  };
}

export function ejecutarPruebasNegativas(): boolean {
  console.log('\n========================================================================');
  console.log('🧪 EJECUTANDO SUITE DE PRUEBAS NEGATIVAS DE VERIFICACIÓN');
  console.log('========================================================================\n');

  const rutaMatriz = resolve(process.cwd(), 'docs/MATRIZ_COMPLETITUD_ASIENTOS.md');
  const contenidoOriginal = readFileSync(rutaMatriz, 'utf8');
  let todasPasaron = true;

  // Caso Negativo 1: Alterar un total en la tabla de resumen
  console.log('1. Probando Caso Negativo 1: Total alterado en tabla resumen...');
  const contenidoTotalAlterado = contenidoOriginal.replace(
    '| **01 Registro de Compras (RCE)** | 28 |',
    '| **01 Registro de Compras (RCE)** | 99 |'
  );
  const res1 = ejecutarVerificacionMatriz(contenidoTotalAlterado);
  if (!res1.valido && res1.errores.some(e => e.includes('Total en resumen (99) != filas reales'))) {
    console.log('   ✔ DETECTADO CORRECTAMENTE: Falló por discrepancia de totales en resumen.');
  } else {
    console.error('   ❌ ERROR: No detectó la alteración del total en la tabla de resumen.');
    todasPasaron = false;
  }

  // Caso Negativo 2: Inyectar un ID inexistente en las pruebas
  console.log('2. Probando Caso Negativo 2: ID inexistente con estado PROBADO...');
  const contenidoIdInventado = contenidoOriginal.replace(
    '| **ESC-C-1.01** |',
    '| **ESC-C-INVENTADO-9.99** |'
  );
  const res2 = ejecutarVerificacionMatriz(contenidoIdInventado);
  if (!res2.valido && res2.errores.some(e => e.includes('ESC-C-INVENTADO-9.99'))) {
    console.log('   ✔ DETECTADO CORRECTAMENTE: Falló por ID no encontrado en suites de prueba.');
  } else {
    console.error('   ❌ ERROR: No detectó el ID inventado.');
    todasPasaron = false;
  }

  // Caso Negativo 3: Ruta de archivo citado que no existe
  console.log('3. Probando Caso Negativo 3: Ruta de archivo citada inexistente...');
  const contenidoRutaFalsa = contenidoOriginal.replace(
    'src/components/views/RegistroComprasView.tsx',
    'src/components/views/VistaFantasmaInexistente.tsx'
  );
  const res3 = ejecutarVerificacionMatriz(contenidoRutaFalsa);
  if (!res3.valido && res3.errores.some(e => e.includes('VistaFantasmaInexistente.tsx'))) {
    console.log('   ✔ DETECTADO CORRECTAMENTE: Falló por archivo no existente en disco.');
  } else {
    console.error('   ❌ ERROR: No detectó la ruta de archivo inexistente.');
    todasPasaron = false;
  }

  // Caso Negativo 4: Escenario marcado PROBADO en un archivo sin aserciones
  console.log('4. Probando Caso Negativo 4: Archivo de prueba sin aserciones en el bloque...');
  const contenidoSinAsercion = contenidoOriginal.replace(
    'server/tests/real/test_pg_matriz_contable.ts',
    'server/tests/fixture_test_sin_aserciones.ts'
  );
  const res4 = ejecutarVerificacionMatriz(contenidoSinAsercion);
  if (!res4.valido && res4.errores.some(e => e.includes('ESC-C-1.01') && e.includes('NO contiene aserciones reales'))) {
    console.log('   ✔ DETECTADO CORRECTAMENTE: Falló al verificar bloque sin aserciones.');
  } else {
    console.error('   ❌ ERROR: No detectó la falta de aserción.', res4.errores);
    todasPasaron = false;
  }

  console.log('\n------------------------------------------------------------------------');
  if (todasPasaron) {
    console.log('✅ TODAS LAS 4 PRUEBAS NEGATIVAS FUERON DETECTADAS Y SUPERADAS CON ÉXITO');
  } else {
    console.error('❌ HUBO FALLOS EN LA SUITE DE PRUEBAS NEGATIVAS');
  }
  console.log('------------------------------------------------------------------------\n');
  return todasPasaron;
}

export function verificarMatriz() {
  console.log('========================================================================');
  console.log('🔍 VERIFICACIÓN DE INTEGRIDAD Y TRAZABILIDAD: MATRIZ DE COMPLETITUD');
  console.log('========================================================================\n');

  const resultado = ejecutarVerificacionMatriz();

  console.log(`📋 Total de escenarios leídos en la matriz: ${resultado.totalEscenarios}`);
  console.log(`📁 Archivos fuente citados verificados en disco: ${resultado.archivosVerificados}`);
  console.log(`🧪 Escenarios con etiqueta PROBADO validados con ID y aserciones: ${resultado.escenariosProbadosValidados}`);
  console.log(`🔢 Total de aserciones activas contadas en los bloques probados: ${resultado.asercionesTotalesContadas}`);

  if (!resultado.valido) {
    console.error('\n❌ SE ENCONTRARON DISCREPANCIAS O ERRORES EN LA MATRIZ DE COMPLETITUD:');
    resultado.errores.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('✅ MATRIZ DE COMPLETITUD 100% VERIFICADA Y SIN DISCREPANCIAS');
  console.log('========================================================================');

  const pruebasNegativasOk = ejecutarPruebasNegativas();
  if (!pruebasNegativasOk) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('verificar-matriz.ts')) {
  verificarMatriz();
}
