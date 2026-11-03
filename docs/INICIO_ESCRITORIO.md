# Inicialización para escritorio en Windows

## Alcance actual

El proyecto es una aplicación web React con servidor Express. El inicializador la prepara como aplicación local, obliga a conectarse a PostgreSQL y abre la interfaz en el navegador predeterminado. No crea un ejecutable nativo ni instala PostgreSQL por cuenta propia.

Esta entrega no certifica el sistema como producto contable de escritorio listo para producción: el plan vigente mantiene pendientes fases funcionales y pruebas de persistencia real. Utilícese con una base PostgreSQL controlada y con respaldos operativos independientes.

## Requisitos

- Windows 10 u 11.
- Node.js 22.12 o posterior y npm.
- Una instancia PostgreSQL accesible y una base vacía preparada para la instalación.
- Permisos de escritura en la carpeta del proyecto y en el perfil del usuario.

El inicializador no instala servicios, no crea usuarios de base de datos y no cambia la configuración de PostgreSQL. La primera ejecución solicita la cadena de conexión de forma oculta. Debe usarse una URI PostgreSQL válida; los caracteres especiales de usuario o contraseña tienen que estar codificados como URL.

## Inicio

1. Abra la carpeta completa del proyecto en el equipo destino.
2. Ejecute [Iniciar-Escritorio.bat](../Iniciar-Escritorio.bat).
3. En el primer inicio, ingrese la cadena de conexión cuando se solicite. Se generan secretos aleatorios propios de la instalación; la configuración se guarda en `.env`, excluida del control de versiones y con acceso limitado al usuario actual.
4. El inicializador instala dependencias desde el archivo de bloqueo si aún no están disponibles, compila la interfaz, inicia el servidor enlazado únicamente a `127.0.0.1`, espera la confirmación de PostgreSQL y abre el navegador.
5. Se crea un acceso directo en el Escritorio para los siguientes inicios. La configuración inicial del estudio y de su administrador se completa en el asistente de la interfaz.

Los datos y credenciales de conexión permanecen en la base indicada por `DATABASE_URL`; no se almacenan dentro del inicializador. Mantenga `.env` protegido y conserve los secretos de instalación: cambiarlos puede invalidar sesiones o impedir descifrar credenciales configuradas.

## Preparar o detener

Desde PowerShell, el mismo script permite preparar sin iniciar el servidor con `-Preparar` y detener la instancia iniciada por esta instalación con `-Detener`. También admite `-NoAbrirNavegador` para iniciar sin abrir una ventana.

Los registros del proceso se guardan bajo `%LOCALAPPDATA%\SistemaContable\instances`. Un error de conexión no cambia al sistema a modo memoria ni anuncia que el servicio está listo.

## Límites importantes

- La aplicación sigue siendo una interfaz web local dentro del navegador; no se ha agregado Electron, Tauri ni un instalador MSI.
- PostgreSQL y las variables de instalación son requisitos; una base inexistente o inaccesible detiene el arranque.
- El servidor local queda enlazado a loopback para no exponer accidentalmente el puerto a la red local. El inicio normal del servidor conserva su host por defecto para otros despliegues.
- Revise [docs/engineering/PLAN_IMPLEMENTACION.md](engineering/PLAN_IMPLEMENTACION.md) antes de usar datos reales: las fases B, B2, C, D y E siguen pendientes según el plan.