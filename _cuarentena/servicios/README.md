# Cuarentena — Servicios Cliente Huérfanos (`_cuarentena/servicios/`)

Servicios cuya única dependencia entrante pertenecía a una vista trasladada a `_cuarentena/vistas/` en C4 (`chore/limpieza-y-mejoras`).

| Archivo | Origen original | Fecha | Motivo | Reversión |
| :--- | :--- | :---: | :--- | :--- |
| `sqlDatabaseService.ts` | `src/services/sqlDatabaseService.ts` | 2026-11-11 | Su único importador en todo el repositorio era `SqlDatabaseView.tsx`, trasladada en C4. | `git revert <hash del commit C4>` |

