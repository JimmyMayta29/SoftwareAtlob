# ATLOB ERP de escritorio para Windows

El instalador y el portable se generan para Windows x64. Ambos abren el asistente de conexión a PostgreSQL y comparten la configuración cifrada del usuario de Windows. El portable se puede copiar y ejecutar en una carpeta independiente. PostgreSQL es un servicio externo a la aplicación.

1. Inicia el servicio de PostgreSQL local. Prepara una base y un rol de aplicación con permiso de conexión. Para una base nueva, el rol necesita permisos para crear su esquema.
2. Abre el instalador o el portable. La pantalla de conexión propone por defecto `localhost` y el puerto `5432`; introduce la base, el usuario y su contraseña. Ante cualquier inconveniente, el asistente informa la causa probable y la acción sugerida.
3. En una base vacía autorizada, el migrador aplica el esquema base. La pantalla única de bienvenida registra el estudio y la cuenta titular (`ADMINISTRADOR`), carga automáticamente los catálogos normativos y semillas en la misma transacción, activa una licencia local de evaluación (`max_usuarios = 3`) e inicia sesión hacia la cartera de empresas. La verificación en dos pasos (2FA / TOTP) es opcional (`mfa_requerido = false` por defecto) y puede activarse o desactivarse en cualquier momento desde **Herramientas › Usuarios y permisos**.
4. Al cerrar la ventana, la aplicación detiene su servidor local. Al reabrir, recupera la conexión cifrada y vuelve a pedir inicio de sesión.

El servidor escucha en un puerto que asigna Windows en `127.0.0.1`. El proceso principal espera una respuesta saludable antes de cargar la interfaz. Un fallo de conexión devuelve al asistente con un mensaje y una opción de reintento.

Los cinco secretos y la conexión se guardan con el cifrado de Windows en `instalacion.bin` dentro de los datos del usuario. El archivo depende del perfil de Windows que lo creó. Una instalación nueva genera claves propias. El uso de una base que contenga credenciales SUNAT o respaldos cifrados con claves anteriores requiere resolver primero la continuidad de esas claves. [Almacenamiento seguro de Electron en Windows](https://www.electronjs.org/docs/latest/api/safe-storage)

Los ejecutables se generan sin firma. Windows SmartScreen puede mostrar una advertencia. La firma y su verificación quedan pendientes.

`npm run desktop:dev` inicia la variante de escritorio desde el repositorio. `npm run dist:win` prepara el servidor y la interfaz, audita el paquete y genera ambos ejecutables en `release/`. `npm run desktop:verify` repite el escaneo del paquete desempaquetado. Para uso normal basta abrir uno de los ejecutables.

## Plan de integración de RLS y claves foráneas

La conexión de escritorio a `sistema_contable` verifica las 15 migraciones base en una transacción de solo lectura. El plan siguiente requiere aprobación antes de cambiar el migrador oficial o aplicar las nuevas etapas en esa base.

| Orden propuesto | Trabajo | Evidencia previa al despliegue |
|---|---|---|
| 1 | Mantener las 15 migraciones y sus hashes. Añadir entradas versionadas para las FK 01 Contabilidad, 02 Comprobantes, 03 Cartera, 04 Tesorería, 05 Planillas, 06 Tributos y 07 SIRE. | Ejecutar el inventario de las 75 relaciones sobre la base vigente y detenerse ante huérfanos o cruces. Confirmar las acciones de borrado y las claves de las tablas hijas. |
| 2 | Convertir las reglas de `seguridadRls.ts` en migraciones oficiales ordenadas. Aplicar 5.1 a secretos, identidad, trabajos y auditoría. Seguir con los lotes 5.2a, 5.2b y 5.2c, y terminar con 5.3. | Verificar aislamiento entre dos empresas, acceso sin contexto, membresía revocada, login, renovación y trabajos con `contabilidad_app`. |
| 3 | Probar el mismo migrador en una base de pruebas vacía y en una copia de pruebas con las 15 entradas existentes. | Comparar catálogo, políticas activas, `FORCE RLS`, claves validadas, hashes del registro y repetición sin cambios. Probar un fallo intermedio y la reversión de la etapa. |
| 4 | Programar el cambio sobre la base existente tras aprobación, respaldo verificado y una ventana de mantenimiento. | Revisar tiempos y bloqueos. Ante un error, revertir la transacción de esa etapa. Mantener una restauración verificada para recuperar un estado anterior a etapas ya confirmadas. |

El migrador de una base nueva aplicará las etapas en el mismo orden que la actualización de una base existente. La prueba de escritorio actual usa el esquema base y la suite de PostgreSQL aplica las etapas adicionales en transacciones que se revierten. [Políticas RLS](https://www.postgresql.org/docs/18/sql-createpolicy.html) · [Validación de restricciones](https://www.postgresql.org/docs/18/sql-altertable.html)
