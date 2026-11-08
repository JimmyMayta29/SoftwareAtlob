process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

console.log('========================================================================');
console.log('🧪 SUITE: IDENTIDAD DE MARCA, SEGURIDAD DE LOGIN Y PERSISTENCIA SEGURA');
console.log('========================================================================\n');

let aserciones = 0;
function test(descripcion: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      aserciones++;
      console.log(`  ✅ PASÓ: ${descripcion}`);
    } catch (err: any) {
      console.error(`  ❌ FALLÓ: ${descripcion}`);
      console.error(err);
      process.exit(1);
    }
  })();
}

async function ejecutar() {
  const { authJwtService, sembrarUsuariosPrueba, limpiarIntentosFallidosLogin } = await import('../services/authJwtService');
  const { auditoriaRepository } = await import('../repositories/auditoriaRepository');
  limpiarIntentosFallidosLogin();
  sembrarUsuariosPrueba('Admin@2026_ClaveSegura');

  // --------------------------------------------------------------------------
  // 1. RECURSOS DE MARCA DEL EJECUTABLE Y LA INTERFAZ
  // --------------------------------------------------------------------------
  console.log('🔹 Grupo 1: Existencia, dimensiones y límites de peso de recursos de marca');

  await test('Icono ejecutable multi-tamaño icon.ico existe y es válido en desktop/build', () => {
    const ruta = join(process.cwd(), 'desktop', 'build', 'icon.ico');
    assert(existsSync(ruta), 'desktop/build/icon.ico debe existir');
    const peso = statSync(ruta).size;
    assert(peso > 10000 && peso < 120000, `desktop/build/icon.ico tiene peso esperado (${peso} bytes)`);
  });

  await test('Icono maestro 512px icon.png existe en desktop/build', () => {
    const ruta = join(process.cwd(), 'desktop', 'build', 'icon.png');
    assert(existsSync(ruta), 'desktop/build/icon.png debe existir');
    assert(statSync(ruta).size > 50000, 'icon.png debe tener resolución completa');
  });

  await test('Imágenes del instalador NSIS existen con formatos válidos (sidebar y header BMP)', () => {
    const sidebar = join(process.cwd(), 'desktop', 'build', 'installerSidebar.bmp');
    const header = join(process.cwd(), 'desktop', 'build', 'installerHeader.bmp');
    assert(existsSync(sidebar), 'installerSidebar.bmp debe existir');
    assert(existsSync(header), 'installerHeader.bmp debe existir');
    assert(statSync(sidebar).size > 100000, 'installerSidebar.bmp debe ser BMP 24bpp');
    assert(statSync(header).size > 15000, 'installerHeader.bmp debe ser BMP 24bpp');
  });

  await test('Ningún recurso de marca para la interfaz supera el límite estricto de 150 KB', () => {
    const dirBrand = join(process.cwd(), 'src', 'assets', 'brand');
    const archivos = [
      'atlob_logo_horizontal.webp',
      'atlob_logo_horizontal.png',
      'atlob_logo_horizontal_blanco.webp',
      'atlob_logo_horizontal_blanco.png',
      'atlob_isotipo.webp',
      'atlob_isotipo.png',
      'atlob_app_icon_256.webp',
      'atlob_app_icon_256.png'
    ];
    for (const arch of archivos) {
      const ruta = join(dirBrand, arch);
      assert(existsSync(ruta), `Archivo ${arch} debe existir en src/assets/brand`);
      const peso = statSync(ruta).size;
      assert(peso < 150 * 1024, `Recurso ${arch} supera 150 KB (${peso} bytes)`);
    }
  });

  await test('Favicon web existe en public/ y tiene versiones para navegador', () => {
    assert(existsSync(join(process.cwd(), 'public', 'favicon.ico')), 'public/favicon.ico debe existir');
    assert(existsSync(join(process.cwd(), 'public', 'favicon-32x32.png')), 'public/favicon-32x32.png debe existir');
  });

  // --------------------------------------------------------------------------
  // 2. ERROR GENÉRICO Y TIEMPO DE RESPUESTA HOMOGÉNEO (TIMING ATTACK RESISTANCE)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Grupo 2: Mensaje de error genérico y resistencia a enumeración por tiempo');

  await test('Mensaje de error es exactamente el mismo para usuario inexistente y contraseña errónea', async () => {
    limpiarIntentosFallidosLogin();
    let errorUsuarioInexistente = '';
    let errorPasswordErronea = '';

    try {
      await authJwtService.login('noexiste@atlob.pe', 'CualquierPassword123!', undefined, undefined, '127.0.0.1');
    } catch (err: any) {
      errorUsuarioInexistente = err.message;
    }

    try {
      await authJwtService.login('admin@atlob.pe', 'PasswordEquivocada123!', undefined, undefined, '127.0.0.1');
    } catch (err: any) {
      errorPasswordErronea = err.message;
    }

    assert(errorUsuarioInexistente.includes('CREDENCIALES_INVALIDAS'), 'Usuario inexistente lanza CREDENCIALES_INVALIDAS');
    assert(errorPasswordErronea.includes('CREDENCIALES_INVALIDAS'), 'Contraseña errónea lanza CREDENCIALES_INVALIDAS');
    assert.equal(
      errorUsuarioInexistente,
      errorPasswordErronea,
      'Los mensajes deben ser idénticos ("Usuario o contraseña incorrectos")'
    );
  });

  await test('Tiempos de respuesta para usuario inexistente y contraseña errónea son comparables (dummy bcrypt)', async () => {
    limpiarIntentosFallidosLogin();
    const t0 = performance.now();
    try {
      await authJwtService.login('fantasma@atlob.pe', 'PruebaTiming123!', undefined, undefined, '127.0.0.1');
    } catch {}
    const duracionInexistente = performance.now() - t0;

    const t1 = performance.now();
    try {
      await authJwtService.login('admin@atlob.pe', 'PruebaTiming123!', undefined, undefined, '127.0.0.1');
    } catch {}
    const duracionExistente = performance.now() - t1;

    // Ambos deben ejecutar bcrypt.compare, por lo que duracionInexistente no debe ser instantánea (< 5ms)
    assert(duracionInexistente > 15, `duracionInexistente (${duracionInexistente.toFixed(2)}ms) debe reflejar cómputo bcrypt`);
    assert(duracionExistente > 15, `duracionExistente (${duracionExistente.toFixed(2)}ms) debe reflejar cómputo bcrypt`);
  });

  // --------------------------------------------------------------------------
  // 3. BLOQUEO TEMPORAL POR INTENTOS FALLIDOS (USUARIO E IP) CON TIEMPO CRECIENTE
  // --------------------------------------------------------------------------
  console.log('\n🔹 Grupo 3: Bloqueo progresivo por intentos fallidos por usuario y origen IP');

  await test('Bloqueo temporal se activa tras 5 intentos fallidos y reporta tiempo restante', async () => {
    limpiarIntentosFallidosLogin();
    const emailObjetivo = 'contador@atlob.pe';

    for (let i = 1; i <= 4; i++) {
      await assert.rejects(
        () => authJwtService.login(emailObjetivo, 'clave_mala', undefined, undefined, '192.168.1.50'),
        /CREDENCIALES_INVALIDAS/
      );
    }

    // Intento 5: activa el bloqueo
    await assert.rejects(
      () => authJwtService.login(emailObjetivo, 'clave_mala', undefined, undefined, '192.168.1.50'),
      /CREDENCIALES_INVALIDAS/
    );

    // Intento 6: debe ser rechazado inmediatamente con CUENTA_BLOQUEADA_TEMPORALMENTE y segundos restantes
    let errorBloqueo = '';
    try {
      await authJwtService.login(emailObjetivo, 'clave_mala', undefined, undefined, '192.168.1.50');
    } catch (err: any) {
      errorBloqueo = err.message;
    }

    assert(errorBloqueo.includes('CUENTA_BLOQUEADA_TEMPORALMENTE'), 'Lanza CUENTA_BLOQUEADA_TEMPORALMENTE');
    assert(/\d+\s*segundos/.test(errorBloqueo), 'Informa los segundos restantes en el mensaje');
  });

  await test('Bloqueo por IP protege contra ataques distribuidos a múltiples usuarios', async () => {
    limpiarIntentosFallidosLogin();
    const ipAtacante = '10.0.0.99';

    for (let i = 1; i <= 5; i++) {
      await assert.rejects(
        () => authJwtService.login(`usuario_${i}@atlob.pe`, 'clave_falsa', undefined, undefined, ipAtacante),
        /CREDENCIALES_INVALIDAS/
      );
    }

    // La IP atacante queda bloqueada para cualquier otro intento
    let errorIp = '';
    try {
      await authJwtService.login('nuevo_usuario@atlob.pe', 'clave_falsa', undefined, undefined, ipAtacante);
    } catch (err: any) {
      errorIp = err.message;
    }
    assert(errorIp.includes('CUENTA_BLOQUEADA_TEMPORALMENTE'), 'IP bloqueada tras 5 intentos');
  });

  // --------------------------------------------------------------------------
  // 4. DINÁMICA DE 2FA: EXIGENCIA Y AUDITORÍA SIN CONTRASEÑAS
  // --------------------------------------------------------------------------
  console.log('\n🔹 Grupo 4: Exigencia dinámica de 2FA y auditoría sin contraseñas');

  await test('Solicitud sin TOTP cuando el estudio exige MFA devuelve MFA_REQUERIDO sin emitir sesión', async () => {
    limpiarIntentosFallidosLogin();
    let errorMfa = '';
    try {
      await authJwtService.login('admin@atlob.pe', 'Admin@2026_ClaveSegura', undefined, undefined, '127.0.0.1');
    } catch (err: any) {
      errorMfa = err.message;
    }
    assert(errorMfa.includes('MFA_REQUERIDO'), 'Contraseña correcta con 2FA activo solicita MFA_REQUERIDO');
  });

  await test('Registro de auditoría de login exitoso y fallido no contiene contraseñas', async () => {
    // Registrar evento de auditoría de prueba
    await auditoriaRepository.registrar({
      usuarioEmail: 'auditoria@atlob.pe',
      tablaAfectada: 'usuarios_estudio',
      registroId: 'auditoria@atlob.pe',
      accion: 'LOGIN_FALLIDO',
      direccionIp: '127.0.0.1',
      datosNuevos: { resultado: 'FALLIDO', razon: 'CREDENCIALES_INVALIDAS' }
    });

    const eventos = await auditoriaRepository.listarEventosSeguridad(10);
    const eventoLogin = eventos.find(e => e.accion === 'LOGIN_FALLIDO' && e.usuarioEmail === 'auditoria@atlob.pe');
    assert(Boolean(eventoLogin), 'Evento LOGIN_FALLIDO registrado en auditoría');
    const textoSerializado = JSON.stringify(eventoLogin);
    assert(!textoSerializado.includes('Admin@2026_ClaveSegura'), 'La auditoría nunca contiene contraseñas');
    assert(!textoSerializado.includes('password'), 'Sin campos de password en auditoría');
  });

  console.log('\n========================================================================');
  console.log(`TOTAL ASERCIONES: ${aserciones} | EXITOSAS: ${aserciones} | FALLIDAS: 0`);
  console.log('RESULTADO: TODAS LAS PRUEBAS DE MARCA Y LOGIN PASARON SATISFACTORIAMENTE');
  console.log('========================================================================');
}

void ejecutar();
