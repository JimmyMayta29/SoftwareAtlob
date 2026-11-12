# Archivo Histórico de Documentación (`docs/_archivo/`)

Este directorio conserva de forma reversible documentación histórica archivada e inventarios de auditoría generados durante las Fases 2 y 3 de limpieza (`chore/limpieza-y-mejoras`).

| Archivo | Origen original | Fecha | Motivo | Reversión |
| :--- | :--- | :---: | :--- | :--- |
| `MEMORIA_TECNICA_V2.md` | `docs/MEMORIA_TECNICA_V2.md` | 2026-11-11 | Documento histórico de octubre 2026 (anterior a los bloques A–F, PCGE 2026 y Desktop Electron); reemplazado por `SISTEMA_ATLOB_ERP.md`. | `git revert b9744af` |
| `RESULTADOS_VERIFICACION.txt` | `docs/RESULTADOS_VERIFICACION.txt` | 2026-11-11 | Evidencia histórica del 2026-10-04T10:33:45Z (`12` suites) vinculada únicamente a `MEMORIA_TECNICA_V2.md`. | `git revert 145c5f3` |
| `INVENTARIO_LIMPIEZA.md` | Creado en `docs/_archivo/` (Fase 1) | 2026-11-11 | Inventario base y matriz de clasificación previa sobre tag `pre-limpieza` (`e402bef`). | — |
| `MOVIMIENTOS_FASE2.md` | Creado en `docs/_archivo/` (Fase 2) | 2026-11-11 | Registro completo e indexado por commit de todos los movimientos, exclusiones, métricas y reversiones de Fase 2 (C0–C6) y Fase 3 (D0–D9). | — |
| `MEDICIONES_FASE3.md` | Creado en `docs/_archivo/` (Fase 3 / D0) | 2026-11-11 | Mediciones reproducibles directas sobre `379a6ec` (migraciones, RLS, FKs, capas, menú, persistencia y comparativa `a0f7da4..e402bef`) que sustentan la documentación de Fase 3. | — |
