# Modelo de licencias y evolución comercial

## 1. Alcance actual: licencia local de evaluación

Durante el primer arranque, `setupService.inicializarEstudio()` registra en la misma transacción una fila única en la tabla de control `licencia`:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` | Identificador interno de la licencia local. |
| `tipo` | `VARCHAR(20)` | `'EVALUACION'` o `'COMERCIAL'`. Al inicializar una nueva instalación se crea como `'EVALUACION'`. |
| `max_usuarios` | `INTEGER` | Límite máximo de usuarios activos (`is_active = TRUE`) en `usuarios_estudio`. Por defecto `3` en evaluación. |
| `vigente_hasta` | `TIMESTAMPTZ` | Fecha opcional de expiración (`NULL` mientras no aplique vencimiento temporal). |
| `creada_en` | `TIMESTAMPTZ` | Sello de tiempo de creación de la licencia. |

### Reglas operativas vigentes
1. **Validación en servidor:** `licenciaService.puedeCrearUsuario()` y `licenciaService.validarCupoDisponible()` se ejecutan siempre en el servidor bajo bloqueo transaccional (`pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`), tanto al crear un colaborador (`POST /api/usuarios`) como al reactivar un usuario previamente desactivado (`PATCH /api/usuarios/:id/estado`).
2. **Cómputo de usuarios activos:** `licenciaService.usuariosActivos()` contabiliza únicamente cuentas con `is_active = TRUE`. Los usuarios desactivados conservan su trazabilidad histórica en `auditoria`, asientos y planillas sin consumir cupo.
3. **Exclusión de respaldos:** La tabla `licencia` pertenece al ámbito `control` en `registroDatosEmpresa.ts` (`exportar: false`), por lo que nunca se exporta ni sobrescribe al respaldar o restaurar una empresa.
4. **Visibilidad:** El tipo de licencia, los usuarios activos en uso y el máximo permitido se consultan en **Herramientas › Usuarios y permisos** y en **Ayuda › Acerca de**.

---

## 2. Limitación explícita de seguridad del esquema actual

> [!IMPORTANT]
> La validación actual de `licencia` es **estrictamente funcional y local**. Funciona como control operativo para instalaciones de evaluación y organiza la estructura de datos previa a la venta comercial, pero **no constituye una medida criptográfica contra manipulación directa de la base de datos**.

En concreto, quien posea acceso administrativo al motor PostgreSQL local de su PC (por ejemplo mediante el superusuario `postgres`) puede modificar directamente `licencia.max_usuarios`, cambiar `licencia.tipo` o alterar `vigente_hasta` en disco. Esta limitación es deliberada en la etapa actual sin servidor de licencias.

---

## 3. Camino evolutivo previsto (no implementado aún)

Para la comercialización formal y el trabajo colaborativo entre varios equipos, se prevé la siguiente arquitectura en tres etapas:

### Etapa A — Licencia firmada verificable sin conexión (Ed25519)
- **Emisión:** Al adquirir o renovar un plan comercial, el estudio recibe un archivo o bloque de licencia JSON canónico (`instalacionId`, `rucTitular`, `tipo`, `maxUsuarios`, `emitidaEn`, `vigenteHasta`, `funcionalidades`) acompañado de una firma digital **Ed25519** generada con una clave privada custodiada fuera del cliente.
- **Verificación local sin Internet:** El binario de escritorio embebe únicamente la **clave pública Ed25519** de verificación. En el arranque y antes de habilitar altas o reactivaciones de usuarios, `licenciaService` verifica criptográficamente la firma sobre el payload canónico y contrasta una huella no sensible del entorno local. Si alguien edita `max_usuarios` o `tipo` directamente en PostgreSQL, la firma deja de coincidir y el servidor degrada a modo de solo lectura o evaluación básica.
- **Ventaja:** Funciona al 100 % en estudios sin conexión permanente a Internet y protege la integridad de los parámetros de licencia frente a ediciones manuales en la base local.

### Etapa B — Servidor de licencias y activación por equipo
- **Activación y renovación:** Un servicio HTTPS liviano emite y renueva certificados de licencia firmados Ed25519 asociados al titular, registrando activaciones por equipo, transferencias autorizadas de PC (por cambio o formateo de hardware) y revocaciones comerciales.
- **Tolerancia sin conexión:** La aplicación opera localmente con su certificado firmado vigente y solo contacta al servidor de licencias al activar, ampliar cupos de usuarios o renovar períodos vencidos (con ventana de gracia configurable).

### Etapa C — Base centralizada para trabajo multi-PC en red local o nube privada
- **Escenario actual:** Cada PC ejecuta su propio servidor local (`127.0.0.1`) contra su PostgreSQL local con un usuario titular y colaboradores locales.
- **Evolución multi-PC:** Para estudios contables donde varios asistentes y contadores trabajan simultáneamente desde distintas computadoras sobre la misma cartera de empresas:
  1. Se despliega una instancia central de PostgreSQL (en un servidor de red local del estudio o instancia administrada con TLS obligatorio) junto con una única instancia del backend Express/Node detrás de HTTPS.
  2. La licencia firmada reside en el servidor central y gobierna tanto el cupo total de usuarios activos (`max_usuarios`) como las sesiones concurrentes del estudio.
  3. Las estaciones de trabajo se conectan al servidor central autenticado (o mediante el cliente de escritorio en modo cliente remoto autorizado), manteniendo intactas las políticas RLS por empresa (`app.empresa_id`, `app.usuario_id`) y las claves foráneas compuestas sin duplicar bases ni cruzar información entre clientes.

