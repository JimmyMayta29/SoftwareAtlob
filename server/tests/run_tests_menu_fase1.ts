import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MENU_DATA, obtenerItemsHojaMenu, tienePermisoMenu, MenuItem } from '../../src/types/menu';

console.log('--- Ejecutando pruebas de Taxonomía de Menú y Separación de Vistas (Fase 1) ---');

// 1. Verificar los 13 grupos de primer nivel
const gruposEsperados = [
  'Archivo',
  'Contabilidad',
  'Compras y Ventas',
  'Facturación',
  'Tributos',
  'Planillas',
  'Registros Electrónicos',
  'Tesorería',
  'Inventarios y Activos',
  'Estados Financieros',
  'Estudio',
  'Herramientas',
  'Ayuda',
];

assert.equal(MENU_DATA.length, 13, 'MENU_DATA debe tener exactamente 13 grupos principales');
assert.deepEqual(
  MENU_DATA.map((g) => g.label),
  gruposEsperados,
  'Los nombres y orden de los grupos de primer nivel deben coincidir con la taxonomía de Atlob'
);

// 2. Verificar unicidad de IDs en todo el árbol
const idsVistos = new Set<string>();
function recorrerArbol(items: MenuItem[]) {
  for (const item of items) {
    assert.ok(!idsVistos.has(item.id), `ID de menú duplicado detectado: ${item.id}`);
    idsVistos.add(item.id);
    if (item.children && item.children.length > 0) {
      recorrerArbol(item.children);
    }
  }
}
for (const g of MENU_DATA) {
  recorrerArbol(g.items);
}

// 3. Verificar hojas: cada opción activa tiene vista exclusiva (1 opción = 1 vista) y existe en disco o acción registrada
const hojas = obtenerItemsHojaMenu(MENU_DATA);
assert.ok(hojas.length >= 50, 'El menú debe contener todas las opciones hoja de la taxonomía');

const vistasActivasUsadas = new Map<string, string>();
const accionesSistema = new Set([
  'AccionCerrarSesion',
  'AccionSalirSistema',
  'AccionRestaurarDemo',
  'AccionFormatoEstandar',
  'AccionFormatoCorporativo',
]);

for (const leaf of hojas) {
  assert.ok(
    typeof leaf.vista === 'string' && leaf.vista.trim().length > 0,
    `El ítem "${leaf.rutaCompleta}" (${leaf.id}) debe declarar su vista objetivo`
  );

  if (leaf.estado === 'activo') {
    const vistaPrevia = vistasActivasUsadas.get(leaf.vista);
    assert.equal(
      vistaPrevia,
      undefined,
      `Violación de regla "1 opción = 1 vista": "${leaf.rutaCompleta}" comparte la vista "${leaf.vista}" con "${vistaPrevia}"`
    );
    vistasActivasUsadas.set(leaf.vista, leaf.rutaCompleta);

    if (!accionesSistema.has(leaf.vista)) {
      const rutaView = path.resolve(process.cwd(), 'src/components/views', `${leaf.vista}.tsx`);
      const rutaModal = path.resolve(process.cwd(), 'src/components/modals', `${leaf.vista}.tsx`);
      const existe = fs.existsSync(rutaView) || fs.existsSync(rutaModal);
      assert.ok(
        existe,
        `El componente "${leaf.vista}.tsx" para la opción activa "${leaf.rutaCompleta}" no existe en src/components/views ni en src/components/modals`
      );
    }
  } else {
    assert.equal(
      leaf.estado,
      'proximamente',
      `Estado desconocido en "${leaf.rutaCompleta}": ${leaf.estado}`
    );
  }
}

// 4. Verificar control de permisos RBAC en ítems restringidos
const itemRespaldo = hojas.find((h) => h.id === 'respaldos');
assert.ok(itemRespaldo, 'Debe existir la opción respaldos');
assert.equal(tienePermisoMenu(itemRespaldo, 'ADMINISTRADOR'), true);
assert.equal(tienePermisoMenu(itemRespaldo, 'ADMIN'), true);
assert.equal(tienePermisoMenu(itemRespaldo, 'CONTADOR'), false);
assert.equal(tienePermisoMenu(itemRespaldo, 'AUDITOR'), false);

console.log(`✔ ${hojas.length} opciones hoja verificadas (${vistasActivasUsadas.size} activas con vistas 1:1 exclusivas).`);
