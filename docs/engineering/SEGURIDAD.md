# Seguridad del servidor y aislamiento de datos

El arranque en producción requiere `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUNAT_ENCRYPTION_KEY`, `MFA_SEED_SECRET` y `BACKUP_ENCRYPTION_KEY`. Cada variable recibe 32 bytes generados con un generador criptográfico y codificados como 64 caracteres hexadecimales. El servidor rechaza valores repetidos, patrones débiles y huellas conocidas. En desarrollo y pruebas, los valores efímeros se limitan al proceso. El MFA de las cuentas se configura individualmente al crear el estudio.

## Valores históricos

Los siguientes tipos de valores estuvieron disponibles en el historial. Si el repositorio es o fue público, trata cualquier valor que se haya utilizado como comprometido. El verificador de arranque guarda solo huellas para detectar los valores históricos aplicables.

| Tipo | Ubicación histórica | Tratamiento |
|---|---|---|
| Firma de acceso y renovación JWT | `server/config/env.ts`, documentación antigua del despliegue | Cambiar ambas claves e invalidar las sesiones emitidas con ellas |
| Cifrado de credenciales y claves de empresa | `server/config/env.ts`, `server/services/cryptoService.ts` y `server/utils/crypto.ts` | Inventariar los registros v1 y v2 y conservar la clave anterior fuera del repositorio hasta terminar la migración |
| MFA y contraseña de cuentas de demostración | `server/services/authJwtService.ts`, documentación antigua de la cuenta inicial | Eliminar credenciales fijas. Restablecer las que se hayan reutilizado |
| Clave de respaldo | `server/services/backupEmpresaService.ts` | Tratar los paquetes históricos como expuestos si se cifraron con la clave fija |
| Contraseñas de bases descartables | `.github/workflows/test-pg.yml`, `docker-compose.test.yml` | Usar contraseñas independientes generadas en cada ejecución |
| Claves SOL y secretos de cliente de demostración | `src/data/empresasClientes.ts` y vistas antiguas | Revocar cualquier valor registrado o reutilizado en un servicio real |
| API de IA | `.env.example` histórico | Revocar si estuvo activa. Mantener vacío el ejemplo |

Una migración de cifrado v1/v2 requiere autorización y una copia verificable. Identificar el formato de cada registro, descifrar con la clave anterior en memoria, recifrar con la nueva y verificar la autenticación antes de confirmar por empresa. Para v2, reenvolver la clave de datos cuando cambie solo la clave maestra. Retirar la clave anterior después de verificar todas las filas y los respaldos autorizados.

La auditoría de credenciales conserva indicadores de cambios. El lector de auditoría y el respaldo aplican una lista de campos permitidos, incluso al leer eventos anteriores. El tratamiento de eventos históricos que incluya modificaciones requiere una decisión separada porque la cadena se verifica con los datos originales.

## Cambios de esquema preparados para pruebas

`npm run test:pg` ejecuta las pruebas base y prueba las etapas de `server/db/seguridadRls.ts` y los módulos `server/db/fk_empresa_*.sql`. La segunda parte exige PostgreSQL 18, `atlob_test` y `contabilidad_app` con privilegios restringidos. Ejecuta los cambios en transacciones con rollback y verifica que el catálogo de pruebas vuelve a su estado anterior. El arranque normal conserva sus 15 migraciones.

La primera etapa RLS protege las credenciales, trabajos, sesiones, membresías y auditoría. Las tablas de identidad usan `app.usuario_id` después de autenticar al usuario. Las filas de empresa usan `app.empresa_id` en el cliente transaccional. Para auditoría del estudio, se comprueban el administrador activo y el estudio configurado. Los trabajadores vuelven a consultar la membresía antes de procesar un trabajo.

Las etapas siguientes protegen datos contables, tesorería, documentos y reportes, y por último los catálogos de empresa. `planilla_lineas` deriva su empresa de `planillas`. Cuando se agregue almacenamiento persistente para kardex y activos fijos, sus tablas se registrarán con su alcance de empresa.

Antes de desplegar las claves compuestas, repetir el diagnóstico de referencias para los datos vigentes, tomar un respaldo y revisar el resultado por relación. Ejecutar cada módulo en una transacción, detenerse ante inconsistencias y conservar las acciones de borrado. Revisar los tiempos de bloqueo en un entorno con volumen representativo. La aplicación en `sistema_contable` de RLS y claves compuestas requiere autorización expresa. [Políticas RLS](https://www.postgresql.org/docs/18/sql-createpolicy.html) · [Validación de restricciones](https://www.postgresql.org/docs/18/sql-altertable.html)
