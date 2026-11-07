# Carga de referencia del PCGE 2026

Conserve el archivo original en un directorio local. Use su ruta al ejecutar estos comandos desde el repositorio.

```powershell
npm run cargar:pcge -- "ATLOB_ERP_PCGE_2026_CLASIFICADO_v2.xlsx" --verificar
npm run cargar:pcge -- "ATLOB_ERP_PCGE_2026_CLASIFICADO_v2.xlsx"
```

El primer comando comprueba el libro sin conectarse a PostgreSQL. El segundo lee `DATABASE_URL` del `.env` local y exige que la sesión use `contabilidad_app` en `sistema_contable` sobre PostgreSQL 18 local.

La carga guarda el contenido de `Plan_Cuentas`, `Pendientes` y `Pendientes_Clasificacion` en `staging.pcge_importacion`. Conserva el SHA-256 del archivo, la hoja, la fila y los valores originales como texto dentro de JSONB, incluidos los estados de validación y clasificación. La transacción coteja todas las filas con la fuente antes de confirmar. Volver a ejecutar el comando con el mismo archivo muestra cero filas nuevas.

Los códigos de `Plan_Cuentas` son únicos en el libro. La hoja `Pendientes_Clasificacion` contiene 76 filas de revisión para 68 códigos, por lo que las apariciones repetidas se conservan por número de fila. La hoja `Pendientes` registra otras 22 observaciones. La aplicación sigue leyendo su plantilla habitual desde `public.plantilla_pcge` y los planes de cada empresa desde `public.plan_cuentas`. Una eventual aprobación de la referencia para uso contable requiere un proceso independiente.

```sql
SELECT archivo_sha256, hoja, count(*) AS filas
FROM staging.pcge_importacion
GROUP BY archivo_sha256, hoja
ORDER BY archivo_sha256, hoja;
```
