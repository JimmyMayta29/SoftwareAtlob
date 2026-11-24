# Conciliación Bancaria V2 — Núcleo Backend (Fase 1)

## 1. Arquitectura General (Fase 1)

El módulo de **Conciliación Bancaria V2** provee un núcleo transaccional aislado por empresa sobre PostgreSQL (RLS activo), sin fallbacks en memoria y con aritmética decimal exacta basada en `Money` (`decimal.js`, redondeo `ROUND_HALF_UP`).

Componentes principales:
- **Contratos DTO (`server/types/conciliacionV2.ts`)**: Define `ESTADOS_CONCILIACION_V2` y los DTOs de entrada/salida. Todos los importes monetarios se serializan como cadenas decimales exactas con 2 decimales (`'0.00'`) generadas con `Money.format(...)` para evitar errores de punto flotante en consumidores HTTP y frontend.
- **Servicio de dominio (`server/services/conciliacionV2Service.ts`)**: Funciones puras de cálculo/validación y operaciones transaccionales mediante `db.withEmpresaTransaction(empresaId, ...)`, cálculo de rango mensual real vía `obtenerRangoMesPeriodo(periodo)` y bitácora inmutable encadenada en `auditoria_log` mediante `registrarAuditoriaEnTx(...)`.
- **Controlador y rutas (`server/controllers/conciliacionV2Controller.ts`, `server/routes/conciliacionV2Routes.ts`)**: Validación estricta con `zod`, aislamiento de empresa por ruta (`req.empresaId`) y control RBAC por rol en cada endpoint bajo `/api/empresas/:empresaId/conciliacion-v2`.

### Endpoints disponibles (Fase 1)
| Método y Ruta | Roles permitidos | Propósito |
|---|---|---|
| `GET /config` | `ROLES_LECTURA` | Obtiene parámetros V2 por empresa o defaults |
| `PUT /config` | `ADMINISTRADOR` (empresa + `rolGlobal`) | Configura tolerancias, cuentas PCGE y flag V2 |
| `GET /cuentas` | `ROLES_LECTURA` | Lista cuentas financieras con estado de vinculación PCGE |
| `GET /cuentas-contables-disponibles` | `ROLES_LECTURA` | Lista cuentas `10%` activas con `permite_movimiento = true` |
| `PUT /cuentas/:cuentaId/vincular-contable` | `ADMINISTRADOR`, `CONTADOR_SENIOR` | Vincula `cuenta_contable_id`, `cuenta_contable_codigo` y CCI opcional |
| `GET /resumen` | `ROLES_LECTURA` | Resumen numérico, partidas, semáforo e integridad Mayor `104x` |
| `POST /partidas/conciliar` | `ADMINISTRADOR`, `CONTADOR_SENIOR`, `ASISTENTE_CONTABLE` | Concilia línea de extracto y sincroniza movimiento de tesorería |
| `POST /partidas/desconciliar` | `ADMINISTRADOR`, `CONTADOR_SENIOR`, `ASISTENTE_CONTABLE` | Revierte conciliación en ambos sentidos |
| `POST /cerrar` | `ADMINISTRADOR`, `CONTADOR_SENIOR` | Cierra periodo con diferencia `0.00` y persiste snapshot |
| `POST /reabrir` | `ADMINISTRADOR` | Reabre conciliación cerrada exigiendo motivo auditado |

---

## 2. Feature Flag `CONCILIACION_V2` y Configuración por Empresa

1. Si existe registro en `conciliacion_config_empresa` para la empresa (`configuradaEnBd: true`), **prevalece** el valor persistido en base de datos (`conciliacion_v2_habilitada`, tolerancias y cuentas PCGE).
2. Si la empresa aún no tiene fila en `conciliacion_config_empresa` (`configuradaEnBd: false`), se devuelven los valores por defecto:
   - `conciliacionV2Habilitada`: `true` solo si `process.env.CONCILIACION_V2 === 'true'` o `'1'` (`false` por defecto).
   - `toleranciaDias`: `3`
   - `toleranciaMonto`: `'0.00'`
   - `cuentaItfCodigo`: `'6412'`
   - `cuentaComisionCodigo`: `'6391'`
   - `cuentaInteresGastoCodigo`: `'67311'`
   - `cuentaInteresIngresoCodigo`: `null` (con `sugerenciaCuentaInteresIngreso: '7793'`, sin persistirse automáticamente).

---

## 3. Fórmula Exacta de Conciliación y Semáforo

Todas las operaciones se calculan con `Money` (`decimal.js`):

```text
saldoAjustadoBanco  = saldoFinalExtracto + depositosEnTransito - chequesNoCobrados
saldoAjustadoLibros = saldoLibros + abonosNoRegistrados - cargosNoRegistrados
diferencia          = saldoAjustadoBanco - saldoAjustadoLibros
```

Donde:
- `saldoLibros`: `cuenta.saldoInicial + SUM(INGRESO) - SUM(otros movimientos no anulados)` acumulado hasta `fechaFin` del mes.
- `depositosEnTransito`: suma de `movimientos_tesoreria` no conciliados de tipo `INGRESO` (del periodo o anteriores aún pendientes hasta `fechaFin`).
- `chequesNoCobrados`: suma de egresos/salidas de `movimientos_tesoreria` no conciliados hasta `fechaFin`.
- `abonosNoRegistrados`: suma de líneas de extracto del periodo no conciliadas (excluyendo `DUPLICADO`) con `monto > 0`.
- `cargosNoRegistrados`: suma del valor absoluto (`|monto|`) de líneas de extracto del periodo no conciliadas (excluyendo `DUPLICADO`) con `monto < 0`.

Reglas del semáforo (`SemaforoConciliacion`):
- `SIN_EXTRACTO`: no existen extractos bancarios activos que cubran el periodo (`tieneExtracto === false`; `diferencia = null`).
- `VERDE`: `Money.isEqual(diferencia, 0)`.
- `AMARILLO`: `toleranciaMonto > 0` y `|diferencia| <= toleranciaMonto`.
- `ROJO`: cualquier otra diferencia fuera de tolerancia.

---

## 4. Derivación de Estados (Lado Banco y Lado Libro)

### Lado Banco (`extracto_lineas`) — `derivarEstadoEfectivoExtracto`
Mantiene sincronía con el booleano legacy `conciliada`:
- Si `conciliada === true` y `estado_conciliacion` es nulo o `'PENDIENTE_LIBROS'` → `'CONCILIADO'`.
- Si `conciliada === false` y `estado_conciliacion` es `'CONCILIADO'` o `'CONCILIADO_MANUAL'` → `'PENDIENTE_LIBROS'`.
- En cualquier otro caso devuelve el valor válido de `ESTADOS_CONCILIACION_V2` o `'PENDIENTE_LIBROS'`.

### Lado Libro (`movimientos_tesoreria`) — `derivarEstadoLibroV2`
En la **Fase 1**, `PENDIENTE_BANCO` y `CHEQUE_NO_COBRADO` se **calculan dinámicamente al consultar** y **no** se persisten en `movimientos_tesoreria` hasta la Fase 3:
- `conciliado === true` → `'CONCILIADO'`
- `conciliado === false && tipo === 'EGRESO' && medioPago === '007'` → `'CHEQUE_NO_COBRADO'`
- Cualquier otro movimiento no conciliado → `'PENDIENTE_BANCO'`

---

## 5. Control de Integridad vs Mayor `104x`

Cuando la cuenta financiera tiene `cuenta_contable_id` vinculada, el resumen consulta el saldo acumulado contabilizado en contabilidad hasta `fechaFin`:
- Fuente: `asiento_detalle ad JOIN asientos a ON a.id = ad.asiento_id AND a.empresa_id = ad.empresa_id` filtrando `ad.empresa_id`, `ad.cuenta_id = cuenta_contable_id`, `a.estado = 'CONTABILIZADO'` y `a.fecha <= fechaFin`.
- Fórmula: `saldoMayor104x = SUM(ad.debe) - SUM(ad.haber)` (vía `Money`).
- Comparación: `diferenciaIntegridadMayor = saldoLibros - saldoMayor104x`. Si difiere de `'0.00'`, se activa `alertaIntegridad = true` con el detalle del descuadre en `motivoAlerta`.

---

## 6. Reglas de Bloqueo Operativo

1. **Bloqueo por `cuenta_contable_id` NULL (`409 CUENTA_CONTABLE_NO_VINCULADA`)**:
   - `validarPrecondicionOperacionCuenta` impide conciliar partidas, desconciliar partidas o cerrar la conciliación si la cuenta financiera no está vinculada a una cuenta del `plan_cuentas` de la empresa.
   - En `GET /cuentas`, estas cuentas se exponen con `requiereVinculacionContable: true` y en `GET /resumen` se reporta `integridadMayor.verificada: false` con `alertaIntegridad: true`.
2. **Bloqueo por `cuenta_interes_ingreso_codigo` NULL (`409 CUENTA_INTERES_INGRESO_NO_CONFIGURADA`)**:
   - `validarCuentasAsientoConfig('INTERES_INGRESO', config, codigosPlanEmpresa)` bloquea la generación de asientos de intereses financieros ganados mientras la empresa no haya configurado explícitamente `cuentaInteresIngresoCodigo` (sugerencia de UI: `'7793'`).
3. **Bloqueo por cuenta PCGE inexistente o inactiva (`409 CUENTA_PCGE_INEXISTENTE_EN_EMPRESA`)**:
   - Tanto `actualizarConfig` como `validarCuentasAsientoConfig` exigen que todo código PCGE configurado exista activo en `plan_cuentas` de la empresa.

---

## 7. Semilla Demo Idempotente (`npm run seed:conciliacion-demo`)

El script [server/db/seed_conciliacion_demo.ts](../../../server/db/seed_conciliacion_demo.ts) siembra un conjunto de datos idempotente para pruebas locales de **Conciliación Bancaria V2** (`npm run seed:conciliacion-demo`).

### Requisitos y guardias de seguridad
- **`SEED_DEMO_PASSWORD` obligatoria**: no existe ninguna contraseña por defecto ni fallback. Si `SEED_DEMO_PASSWORD` no está definida o tiene menos de 8 caracteres (después de `.trim()`), el script falla antes de conectarse a PostgreSQL con el error `SEED_DEMO_PASSWORD_REQUERIDA` y código de salida distinto de cero.
- **Guardia exclusiva sobre `atlob_test`**: la conexión debe apuntar obligatoriamente a la base `/atlob_test` en host local (`localhost`, `127.0.0.1` o `[::1]`) usando el rol `contabilidad_app`. Cualquier intento contra `sistema_contable` u otra base/usuario es rechazado explícitamente (`BASE_PROHIBIDA` / `GUARDIA_ENTORNO_RECHAZADA` / `SESION_BD_INVALIDA`).
- **Sin exposición de secretos**: la clave proporcionada se procesa únicamente en memoria para generar el hash `bcrypt` del usuario demo y nunca se imprime en consola ni se registra en disco.

### Ejecución segura sin exponer secretos en historial o consola

**PowerShell (Windows):**
```powershell
$sec = Read-Host 'SEED_DEMO_PASSWORD (mín. 8 caracteres)' -AsSecureString
$env:SEED_DEMO_PASSWORD = [Net.NetworkCredential]::new('', $sec).Password
npm run seed:conciliacion-demo
Remove-Item Env:SEED_DEMO_PASSWORD
```

**Bash (Linux/macOS/Git Bash):**
```bash
read -r -s -p "SEED_DEMO_PASSWORD (mín. 8 caracteres): " SEED_DEMO_PASSWORD
echo
SEED_DEMO_PASSWORD="$SEED_DEMO_PASSWORD" npm run seed:conciliacion-demo
unset SEED_DEMO_PASSWORD
```
