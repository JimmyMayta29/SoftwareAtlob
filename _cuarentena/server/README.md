# Cuarentena — Catálogos Huérfanos de Servidor (`_cuarentena/server/`)

Catálogos estáticos en `server/data/catalogos/` sin importadores ni lecturas dinámicas en código, scripts, SQL, pruebas o CI, trasladados de forma reversible en C5 (`chore/limpieza-y-mejoras`).

| Archivo | Origen original | Fecha | Motivo | Reversión |
| :--- | :--- | :---: | :--- | :--- |
| `reglasContabilizacionCatalogo.ts` | `server/data/catalogos/reglasContabilizacionCatalogo.ts` | 2026-11-11 | 0 importadores y 0 lecturas dinámicas; las reglas reales viven en `contabilizacionService.ts` y base de datos. | `git revert <hash del commit C5>` |
| `subdiariosCatalogo.ts` | `server/data/catalogos/subdiariosCatalogo.ts` | 2026-11-11 | 0 importadores y 0 lecturas dinámicas; contenía mapa desfasado (`'07'` para Caja Chica) distinto a BD y `subdiarioService.ts`. | `git revert <hash del commit C5>` |
| `sunatCatalogos.ts` | `server/data/catalogos/sunatCatalogos.ts` | 2026-11-11 | 0 importadores y 0 lecturas dinámicas; subconjunto duplicado de `src/data/sunatCatalogos.ts` (el usado en frontend) y con mapas de subdiarios en conflicto. | `git revert <hash del commit C5>` |
