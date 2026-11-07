import { writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';

const archivoSalida = process.env.ATLOB_ARCHIVO_ASERCIONES || '';
delete process.env.ATLOB_ARCHIVO_ASERCIONES;

const req = createRequire(import.meta.url);
const assertBase = req('node:assert') as typeof import('node:assert');
const assertStrict = req('node:assert/strict') as typeof import('node:assert/strict');

let totalAserciones = 0;
let enCurso = false;

function envolverFuncion<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: unknown, ...args: any[]) {
    if (!enCurso) {
      totalAserciones++;
    }
    const previo = enCurso;
    enCurso = true;
    try {
      const resultado = fn.apply(this, args);
      if (resultado && typeof (resultado as Promise<unknown>).finally === 'function') {
        return (resultado as Promise<unknown>).finally(() => {
          enCurso = previo;
        });
      }
      enCurso = previo;
      return resultado;
    } catch (err) {
      enCurso = previo;
      throw err;
    }
  } as T;
}

function construirModuloAssert(real: Record<string | symbol, any>) {
  const envuelto = envolverFuncion(real as unknown as (...args: any[]) => any) as Record<string | symbol, any>;
  for (const clave of Reflect.ownKeys(real)) {
    if (clave === 'length' || clave === 'name' || clave === 'prototype') continue;
    const valor = real[clave];
    if (typeof valor === 'function' && clave !== 'AssertionError' && clave !== 'CallTracker') {
      envuelto[clave] = envolverFuncion(valor.bind(real));
    } else {
      envuelto[clave] = valor;
    }
  }
  return envuelto;
}

const g = globalThis as Record<string, unknown>;
const envueltoBase = construirModuloAssert(assertBase as unknown as Record<string | symbol, any>);
const envueltoStrict = construirModuloAssert(assertStrict as unknown as Record<string | symbol, any>);
envueltoBase.strict = envueltoStrict;
envueltoStrict.strict = envueltoStrict;
g.__atlobAssertBase = envueltoBase;
g.__atlobAssertStrict = envueltoStrict;

// Interceptar también las aserciones propias de las suites que registran "✅ PASÓ:" sin node:assert
const logOriginal = console.log.bind(console);
console.log = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('✅ PASÓ:')) {
    totalAserciones++;
  }
  logOriginal(...args);
};

registerHooks({
  load(url, context, nextLoad) {
    if (url === 'node:assert' || url === 'node:assert/strict') {
      const claveGlobal = url.endsWith('/strict') ? '__atlobAssertStrict' : '__atlobAssertBase';
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          `const m = globalThis.${claveGlobal};`,
          'export default m;',
          'export const ok = m.ok;',
          'export const equal = m.equal;',
          'export const notEqual = m.notEqual;',
          'export const strictEqual = m.strictEqual;',
          'export const notStrictEqual = m.notStrictEqual;',
          'export const deepEqual = m.deepEqual;',
          'export const notDeepEqual = m.notDeepEqual;',
          'export const deepStrictEqual = m.deepStrictEqual;',
          'export const notDeepStrictEqual = m.notDeepStrictEqual;',
          'export const throws = m.throws;',
          'export const doesNotThrow = m.doesNotThrow;',
          'export const rejects = m.rejects;',
          'export const doesNotReject = m.doesNotReject;',
          'export const match = m.match;',
          'export const doesNotMatch = m.doesNotMatch;',
          'export const fail = m.fail;',
          'export const ifError = m.ifError;',
          'export const AssertionError = m.AssertionError;',
          'export const strict = m.strict;',
        ].join('\n'),
      };
    }
    return nextLoad(url, context);
  },
});

process.on('exit', () => {
  if (archivoSalida) {
    try {
      writeFileSync(archivoSalida, String(totalAserciones), 'utf8');
    } catch {
      // Ignorar fallos de escritura temporal al salir
    }
  }
});
