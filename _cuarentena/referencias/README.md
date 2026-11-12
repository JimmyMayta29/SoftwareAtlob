# Cuarentena — Referencias Estáticas (`_cuarentena/referencias/`)

| Archivo | Origen original | Fecha de traslado | Motivo | Reversión |
| :--- | :--- | :---: | :--- | :--- |
| `Atlob_Consultores_ERP___Barra_superior_b5c47105.html` | `public/assets/aistudio/Atlob_Consultores_ERP___Barra_superior_b5c47105.html` | 2026-11-11 | Mockup HTML estático de referencia UI sin importadores ni referencias en runtime (`src/`, `server/`, `desktop/` o tests). Al residir en `public/`, `vite build` lo copiaba automáticamente a `dist/assets/aistudio/` y al paquete de escritorio (`desktop/generated/dist/`). | `git revert <hash del commit C2>` (ver `docs/_archivo/MOVIMIENTOS_FASE2.md`) |
