# Registro de Generación de Release — ATLOB ERP v2.0.0

## 1. Metadatos de compilación

- **Aplicación:** `ATLOB ERP` (`appId: pe.atlob.erp`, paquete `contabilidad-estudio`)
- **Versión:** `2.0.0`
- **Plataforma objetivo:** Windows x64 (`nsis` Setup y `portable`)
- **Configuración de empaquetado:** `desktop/electron-builder.yml` (`asar: true`, `perMachine: false`, `forceCodeSigning: false`)
- **Verificación de paquete (`afterPack` / `desktop:verify`):** `ESCANEO_PAQUETE app.asar | archivos=53 | textos=39 | hallazgos=0 | EXIT_CODE=0`
- **Commit base de código compilado:** `dcbb140585f99e0cdf82490d69cfa46faf299cab` (+ cambios locales de fases 1–4 confirmados en `v2.0.0`)

---

## 2. Artefactos generados en `release\`

| Archivo | Tamaño (bytes) | Fecha de modificación | Hash SHA-256 |
|---|---|---|---|
| `release\ATLOB-ERP-2.0.0-Setup-x64.exe` | `123450964` | `14/11/2026 20:26:45` | `F2146C965F244FC8C4C30E3D6CB2A363F23BFB03D78C414DA4A9A2BF45691519` |
| `release\ATLOB-ERP-2.0.0-Portable-x64.exe` | `112225474` | `14/11/2026 20:29:54` | `8DF142573B932C250A02373418CA6162B7D67F956157C750943D18ED6BC8FA94` |
| `release\win-unpacked\ATLOB ERP.exe` | (directorio `win-unpacked`) | `14/11/2026 20:25:43` | `07EFD0962F3C0DF27665885113D2C03BFA3C38A305D197A855FB94E87EBFA9FA` |
| `release\win-unpacked\resources\app.asar` | (dentro de `win-unpacked`) | `14/11/2026 20:25:43` | `D179DD8CD1FD0129C1CF4C7B7CAB56FECB56234932384C010F506AD3A6A29741` |
| `release\ATLOB-ERP-2.0.0-Setup-x64.exe.blockmap` | `129732` | `14/11/2026 20:26:54` | — |
| `release\builder-debug.yml` | `6051` | `14/11/2026 20:29:54` | — |
| `release\latest.yml` | `355` | `14/11/2026 20:29:54` | — |

---

## 3. Certificado público CA LAN para distribución a clientes

| Archivo | SHA-256 del archivo `.crt` | Fingerprint X.509 SHA-256 (`cert-info.json`) | SAN activos |
|---|---|---|---|
| `storage\certs\cliente-lan\atlob-lan-ca.crt` | `1D7794FBFA016960006947F8D85E044D04D12FBAF556F6223EA30E143B224FF7` | `47:00:D1:74:71:8C:C5:26:34:73:69:26:B9:1D:59:BA:86:E3:5A:C7:67:C9:1E:42:C1:5C:7B:4B:9A:29:F4:6A` | `DNS:localhost`, `DNS:JOSEPHMC`, `IP:127.0.0.1`, `IP:192.168.1.34` |

- Certificado generado el `2026-11-14T15:26:33.201Z` (`storage\certs\cert-info.json`).
- **Exclusiones verificadas en paquete:** ni `.env`, ni llaves privadas `.key`, ni contraseñas PostgreSQL, ni credenciales SUNAT, ni archivos `.atlob.bak` están empaquetados en `app.asar` ni en los instaladores.

---

## 4. Archivo controlado de instaladores anteriores (`0.0.0`)

Los artefactos previos `0.0.0` fueron retirados de `release\` y movidos a `storage\archivo-releases\v0.0.0-20261112\`:

| Archivo archivado | Tamaño (bytes) | Fecha |
|---|---|---|
| `ATLOB-ERP-0.0.0-Setup-x64.exe` | `123413599` | `12/11/2026 13:16:27` |
| `ATLOB-ERP-0.0.0-Portable-x64.exe` | `112192628` | `12/11/2026 13:20:58` |
| `ATLOB-ERP-0.0.0-Setup-x64.exe.blockmap` | `129675` | `12/11/2026 13:16:46` |
| `builder-debug.yml` | `6051` | `12/11/2026 13:20:58` |
| `latest.yml` | `355` | `12/11/2026 13:20:58` |

En `release\` no quedan archivos `*0.0.0*`.
