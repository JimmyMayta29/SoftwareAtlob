import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'rolldown/utils';

// Huellas de los literales SOL/SIRE retirados del historial de las vistas y de los datos demo.
export const huellasHistoricas = new Set([
  '2aca9c329c8d44003ea476c2c17f4feeecd69b85b1a855dd249bb620ccd1a3fc',
  '358980ba52b81c1e3ae7e08ddaef1c7b1464244f5ba60986d253fc656dd9f422',
  '7c1a1cb64a47945b3d664d588d23c94f9f3dd219edf51896e9ad6f2c1f6719ad',
  '7ce98b8cd87ab65b8605416be1a01695bf2422757b206c34fb67337fedfb8b51',
  '9712ce0579a96322fbdb64f9ad419bd7ebb8ff5843d3822a0754b440a8ffd50e',
  'a8e6b6c88342e6b4b9566bc5f23ccda9f65e4ed5b6049ea7d2c464b7cd89f10e',
  'bd203424d6cee7ba876b44f0104256e608dadf7780c82c3f23e9d870d42c9228',
  'c94dabac0d753474334ff69233696380e2770e8e5bd0234553d67f59f9f6754f',
  'e56ffcd05869d5fb22a4cc6189c67fd01a765500e8dd2b22e1fcd6a61bf672de'
]);
const campoCredencial = /^(?:usuario[_-]?sol|clave[_-]?sol|client[_-]?(?:id|secret)(?:[_-]?sire)?|secreto[_-]?(?:sire|api)|jwt[_-]?(?:refresh[_-]?)?secret|sunat[_-]?encryption[_-]?key)$/i;
const jwt = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const claveApi = /\bAIza[0-9A-Za-z_-]{35}\b/;
const huella = (valor: string) => createHash('sha256').update(valor).digest('hex');
const extensionesCodigo = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const campoEnTexto = /(?<![\w-])(["']?)(usuario[_-]?sol|clave[_-]?sol|client[_-]?(?:id|secret)(?:[_-]?sire)?|secreto[_-]?(?:sire|api)|jwt[_-]?(?:refresh[_-]?)?secret|sunat[_-]?encryption[_-]?key)\1\s*[:=]\s*(["'])([^\r\n]+?)\3/gi;

export function detectar(ruta: string, contenido: string, huellas = huellasHistoricas): string[] {
  const hallazgos = new Set<string>();
  if (jwt.test(contenido)) hallazgos.add('JWT literal');
  if (claveApi.test(contenido)) hallazgos.add('Clave API literal');

  function revisarLiteral(valor: string) {
    if (huellas.has(huella(valor)) || (/^[0-9a-f]+$/i.test(valor) && huellas.has(huella(valor.toLowerCase())))) {
      hallazgos.add('Huella de literal histórico');
    }
  }

  type Nodo = {
    type?: string; name?: string; value?: unknown; operator?: string;
    key?: Nodo; id?: Nodo; init?: Nodo; left?: Nodo; right?: Nodo; property?: Nodo;
    expressions?: unknown[]; quasis?: { value: { cooked: string | null } }[];
  };
  function literal(nodo?: Nodo): string | undefined {
    if (nodo?.type === 'Literal' && typeof nodo.value === 'string') return nodo.value;
    if (nodo?.type === 'TemplateLiteral' && nodo.expressions?.length === 0) return nodo.quasis?.[0]?.value.cooked ?? undefined;
  }
  function revisarAsignacion(campo?: Nodo, valor?: Nodo) {
    if (campoCredencial.test(campo?.name ?? literal(campo) ?? '') && literal(valor)?.trim()) {
      hallazgos.add('Asignación de credencial literal');
    }
  }
  function revisar(objeto: unknown) {
    if (!objeto || typeof objeto !== 'object') return;
    const nodo = objeto as Nodo;
    const valor = literal(nodo);
    if (valor) revisarLiteral(valor);
    if (nodo.type === 'Property') revisarAsignacion(nodo.key, nodo.value as Nodo);
    if (nodo.type === 'VariableDeclarator') revisarAsignacion(nodo.id, nodo.init);
    if (nodo.type === 'AssignmentExpression' && nodo.operator === '=') {
      revisarAsignacion(nodo.left?.type === 'MemberExpression' ? nodo.left.property : nodo.left, nodo.right);
    }
    Object.values(objeto).forEach(revisar);
  }

  if (extensionesCodigo.has(extname(ruta))) {
    const { program, errors } = parseSync(ruta, contenido);
    if (errors.length) hallazgos.add('Sintaxis sin analizar');
    revisar(program);
  } else {
    for (const [, , valor] of contenido.matchAll(/(["'])([^\r\n]*?)\1/g)) revisarLiteral(valor);
    if ([...contenido.matchAll(campoEnTexto)].some(([, , , , valor]) => valor.trim())) {
      hallazgos.add('Asignación de credencial literal');
    }
  }
  return [...hallazgos];
}

assert.deepEqual(detectar('prueba.ts', 'const datos = { claveSol: capturarDato() };'), []);
assert.deepEqual(detectar('prueba.ts', 'const datos = { claveSol: "valor-sintetico" };'), ['Asignación de credencial literal']);
assert.deepEqual(detectar('prueba.js', 'const n="texto-de-prueba";', new Set([huella('texto-de-prueba')])), ['Huella de literal histórico']);
assert.deepEqual(detectar('prueba.ts', ['eyJabcdefgh', 'abcdefghij', 'klmnopqrst'].join('.')), ['JWT literal']);

export const extensionesEscaneables = new Set([...extensionesCodigo, '.json', '.map', '.html', '.css', '.svg', '.txt', '.webmanifest', '.sql']);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raices = process.argv.includes('--dist') ? ['src', 'dist'] : ['src'];
  let archivos = 0;
  for (const raiz of raices) {
    const entradas = readdirSync(raiz, { recursive: true, withFileTypes: true });
    const textos = entradas.filter(item => item.isFile() && extensionesEscaneables.has(extname(item.name).toLowerCase()));
    if (!textos.length) throw new Error('Sin archivos para escanear en ' + raiz);
    for (const item of textos) {
      const ruta = join(item.parentPath, item.name);
      const hallazgos = detectar(ruta, readFileSync(ruta, 'utf8'));
      if (hallazgos.length) {
        console.error(ruta + ' (' + hallazgos.join(', ') + ')');
        process.exitCode = 1;
      }
    }
    archivos += textos.length;
  }
  console.log('ESCANEO_SECRETOS ' + raices.join(' + ') + ' | archivos=' + archivos + ' | EXIT=' + (process.exitCode || 0));
}
