# Cuarentena — Vistas No Enrutadas (`_cuarentena/vistas/`)

Vistas sin ítem en `MENU_DATA`, sin ruta en `src/App.tsx` ni referencia en `docs/MATRIZ_COMPLETITUD_ASIENTOS.md`, trasladadas de forma reversible durante C4 (`chore/limpieza-y-mejoras`).

| Archivo | Origen original | Fecha | Motivo | Reversión |
| :--- | :--- | :---: | :--- | :--- |
| `AccesoDenegadoView.tsx` | `src/components/views/AccesoDenegadoView.tsx` | 2026-11-11 | Vista sin ruta en `App.tsx` ni `MENU_DATA` y sin importadores. | `git revert <hash del commit C4>` |
| `CarteraSaldosView.tsx` | `src/components/views/CarteraSaldosView.tsx` | 2026-11-11 | Vista monolítica reemplazada por `CuentasPorCobrarView`, `CuentasPorPagarView` y `AntiguedadSaldosView`. | `git revert <hash del commit C4>` |
| `EmpresasClientesView.tsx` | `src/components/views/EmpresasClientesView.tsx` | 2026-11-11 | Reemplazada por `MisEmpresasNivel1View`; sin importadores. | `git revert <hash del commit C4>` |
| `GestionNegocioView.tsx` | `src/components/views/GestionNegocioView.tsx` | 2026-11-11 | Vista sin ruta ni importadores. | `git revert <hash del commit C4>` |
| `MaestrosView.tsx` | `src/components/views/MaestrosView.tsx` | 2026-11-11 | Vista monolítica reemplazada por vistas individuales de tablas maestras (`PlanCuentasView`, `TipoCambioView`, `ClientesProveedoresView`). Nota: `src/data/maestros.ts` se conserva por seguir importado desde vistas activas. | `git revert <hash del commit C4>` |
| `SqlDatabaseView.tsx` | `src/components/views/SqlDatabaseView.tsx` | 2026-11-11 | Vista consola SQL cliente sin ruta ni importadores; dependencia exclusiva movida a `_cuarentena/servicios/sqlDatabaseService.ts`. | `git revert <hash del commit C4>` |

