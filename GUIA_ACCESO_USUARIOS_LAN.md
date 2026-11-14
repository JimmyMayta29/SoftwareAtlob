# Guía de Acceso para Usuarios en Red Local (LAN) — ATLOB ERP

Esta guía explica cómo conectar la segunda y tercera computadora de la oficina a **ATLOB ERP** alojado en el equipo principal (`192.168.1.34`), sin instalar base de datos en sus equipos y con comunicación cifrada por HTTPS.

---

## 1. Requisitos en la Computadora Cliente (Usuario 2 y Usuario 3)

- Estar conectada a la **misma red Wi-Fi o cable Ethernet** de la oficina que la PC servidor (`192.168.1.34`).
- Navegador moderno actualizado: Microsoft Edge o Google Chrome.
- Archivo de certificado de confianza de la red interna:
  `storage\certs\atlob-lan-ca.crt` (copiado desde la PC servidor en un USB o carpeta compartida interna).

---

## 2. Instalación Única del Certificado HTTPS Local (Para evitar advertencias del navegador)

> Este paso se realiza **una sola vez** en cada PC cliente (PC 2 y PC 3).

1. Copie el archivo `atlob-lan-ca.crt` al Escritorio de la PC cliente.
2. Haga **doble clic** sobre `atlob-lan-ca.crt` y pulse **Instalar certificado...**
3. Elija **Usuario actual** (o **Equipo local** si tiene permisos de administrador) y pulse **Siguiente**.
4. Seleccione **Colocar todos los certificados en el siguiente almacén** → **Examinar...** → elija **Entidades de certificación raíz de confianza** → **Aceptar**.
5. Finalice el asistente y confirme **Sí** cuando Windows pregunte si confía en la CA interna del estudio (`ATLOB ERP Local CA`).
6. Cierre y vuelva a abrir el navegador (Edge/Chrome).

---

## 3. Ingreso Diario al Sistema

1. Verifique con el administrador que el servidor esté iniciado en la PC principal (`iniciar-servidor-lan.ps1`).
2. En Edge o Chrome, ingrese a la dirección segura:
   **`https://192.168.1.34:3443`**
   *(Recomendación: guárdelo en Favoritos o cree un acceso directo en el Escritorio apuntando a esa URL).*
3. Inicie sesión con su correo y contraseña propios (no comparta la cuenta `ADMINISTRADOR` del estudio):
   - **Contador Senior (`CONTADOR_SENIOR`):** Registra, edita, contabiliza asientos de asistentes y genera reportes/declaraciones.
   - **Asistente Contable (`ASISTENTE_CONTABLE`):** Registra compras, ventas y borradores contables; requiere revisión de Contador/Administrador para cerrar periodos o emitir extornos/contabilizaciones con segregación de funciones.
   - **Auditor / Revisor (`AUDITOR_REVISOR`):** Consulta e imprime libros y estados financieros en modo solo lectura.
4. **Sincronización automática:** Cada operación confirmada en PostgreSQL se refleja automáticamente en las pantallas de los demás usuarios cada **4 segundos** (o al instante al pulsar **Actualizar**).
5. **Control de edición concurrente:** Si dos usuarios abren al mismo tiempo un mismo borrador e intentan guardarlo, el sistema protege el trabajo del primero y muestra un aviso (`VERSION_DESACTUALIZADA`) al segundo para evitar sobrescribir datos accidentalmente.

---

## 4. Solución Rápida de Problemas de Conexión en LAN

| Síntoma en PC Cliente | Causa Más Frecuente | Acción Correctiva |
| :--- | :--- | :--- |
| `No se puede acceder a este sitio` / timeout | Servidor apagado, PC en red Wi-Fi diferente o Firewall sin habilitar | En PC servidor ejecutar `iniciar-servidor-lan.ps1` y verificar que `configurar-firewall-lan.ps1 -ConfirmarFirewall` haya abierto TCP `3443` en perfil Privado. |
| Advertencia `La conexión no es privada` | Falta instalar `atlob-lan-ca.crt` o cambió la IP LAN del servidor | Instalar `atlob-lan-ca.crt` en *Entidades de certificación raíz de confianza*. Si cambió la IP del servidor, ejecutar `npm run cert:lan` en la PC servidor. |
| Mensaje `VERSION_DESACTUALIZADA` al guardar | Otro usuario guardó cambios en el mismo documento segundos antes | Recargar el documento actual para visualizar la última versión confirmada antes de editar. |
| Error `SIN_EMPRESAS_ASIGNADAS` al ingresar | Usuario recién creado sin asignación de empresa | Solicitar al `ADMINISTRADOR` asignarle membresía activa en la empresa correspondiente. |
