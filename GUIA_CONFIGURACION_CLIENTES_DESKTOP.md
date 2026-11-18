# Guía de Configuración de Clientes Desktop — ATLOB ERP v2.0.0

Esta guía describe el flujo paso a paso para conectar cada equipo Windows (`PC Principal`, `PC Cliente 2` y `PC Cliente 3`) utilizando **ATLOB ERP.exe** o **ATLOB-ERP-2.0.0-Portable-x64.exe**.

---

## 1. Archivos necesarios en cada equipo cliente

- Instalador `ATLOB-ERP-2.0.0-Setup-x64.exe` **o** ejecutable portable `ATLOB-ERP-2.0.0-Portable-x64.exe`.
- Certificado público de la Autoridad Certificadora local del estudio: `atlob-lan-ca.crt` (ubicado originalmente en `storage\certs\cliente-lan\atlob-lan-ca.crt` de la PC Principal).
- Credenciales de usuario asignadas por el Administrador (`usuario`/`correo` y contraseña).

---

## 2. Asistente de primera ejecución (`Configuración de conexión`)

Al abrir **ATLOB ERP v2.0.0** por primera vez (o al pulsar **Cambiar servidor** / **Configurar servidor**), se abrirá la ventana **Configuración de conexión**:

1. **Modo de conexión (predeterminado):**
   - Deje seleccionada la opción **`Servidor principal (HTTPS LAN)`** (recomendada para la PC principal y obligatoria en PC Cliente 2 y PC Cliente 3).
   - La opción **`PostgreSQL local independiente`** solo debe usarse en instalaciones locales aisladas que ejecutan su propio motor PostgreSQL en la misma PC.

2. **URL del servidor central:**
   - Ingrese la URL HTTPS y puerto del servidor principal, por ejemplo:
     - `https://192.168.1.34:3443`
   - Si omite el puerto, `normalizarUrlServidorHttps` asigna automáticamente el puerto `:3443`.
   - Por seguridad, el cliente rechaza URLs `http://` o direcciones IP públicas externas a la red privada/local.

3. **Certificado CA del servidor (`.crt`):**
   - Pulse el botón para seleccionar el archivo `atlob-lan-ca.crt`.
   - El asistente mostrará la huella SHA-256 X.509 del certificado cargado para confirmar que coincide con la emitida por la PC Principal:
     - Huella X.509 SHA-256 observada del certificado actual (`cert-info.json`):
       `47:00:D1:74:71:8C:C5:26:34:73:69:26:B9:1D:59:BA:86:E3:5A:C7:67:C9:1E:42:C1:5C:7B:4B:9A:29:F4:6A`
     - Hash SHA-256 del archivo `atlob-lan-ca.crt`:
       `1D7794FBFA016960006947F8D85E044D04D12FBAF556F6223EA30E143B224FF7`

4. **Verificación previa (`Probar conexión TLS + BD`):**
   - Pulse el botón de verificación en el asistente.
   - El proceso principal validará el apretón TLS con `rejectUnauthorized: true` y consultará `/api/health`, confirmando estado `UP` y conexión `POSTGRESQL_CONNECTED`.

5. **Guardar y conectar:**
   - Pulse conectar/guardar. La configuración queda cifrada localmente en `instalacion.bin` usando Windows DPAPI (`safeStorage`), por lo que no volverá a mostrarse el asistente al reabrir la aplicación en el mismo usuario de Windows.

---

## 3. Indicadores de conexión y cambio de servidor

### 3.1 En la pantalla de Inicio de Sesión (`LoginView`)

Debajo del botón **Ingresar**, el cliente de escritorio muestra en todo momento:

- Indicador verde `Servidor LAN: <host> · En línea` (o estado de error si el servidor no responde).
- Botón **Verificar** para refrescar manualmente el estado TLS/API.
- Botón **Cambiar servidor** para reabrir el asistente y apuntar a otra IP/certificado LAN.
- Si falla la red al iniciar sesión, la pantalla muestra recomendaciones específicas para clientes desktop LAN (verificar servidor central encendido, dirección IP LAN y certificado CA).

### 3.2 Con sesión iniciada

En el pie de página de la aplicación autenticada:

- Se muestra permanentemente el estado del servidor central conectado y el botón **Cambiar servidor**.
- Al restablecerse la conexión tras una caída momentánea de red, la aplicación invalida automáticamente las consultas cacheadas (`queryClient.invalidateQueries()`) y recarga los datos desde PostgreSQL.

---

## 4. Comportamiento ante desconexión del servidor central

Si el servidor principal se apaga o la PC cliente pierde conectividad con `https://<IP_LAN>:3443`:

1. El cliente **no cae en arreglos locales en memoria** ni permite registrar operaciones desconectadas.
2. Las llamadas al backend devuelven estado `503 SERVIDOR_NO_DISPONIBLE`.
3. Se muestra el aviso: *"No se pudo conectar con el servidor principal (192.168.1.34). Verifique que la PC principal esté encendida y el servidor activo."* con dos botones:
   - **Reintentar conexión**
   - **Configurar servidor**
4. Una vez reiniciado el servidor central en la PC Principal, pulse **Reintentar conexión** y vuelva a autenticarse; los asientos, comprobantes y reportes previamente confirmados permanecerán íntegros en PostgreSQL.
