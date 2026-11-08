# Manual y Registro de Identidad Visual de Marca — ATLOB ERP

Este documento registra los recursos oficiales de identidad visual incorporados al sistema contable, su trazabilidad de origen en `C:\PROYECTOS SUNAT\Logo Atlob`, su destino en el repositorio, dimensiones, peso, propósito y huellas criptográficas SHA-256.

---

## 1. Principios de Identidad y Paleta Corporativa

La identidad visual de **ATLOB ERP** refleja solidez contable, formalidad tributaria y modernidad tecnológica mediante un isotipo 3D con cintas entrelazadas en azul oceánico y lazo ámbar dorado, contrastado con una tipografía geométrica en azul marino profundo.

### 1.1 Paleta Cromática Oficial
- **Azul Marino Corporativo (`#01172C` / `rgb(1, 23, 44)`):** Color principal de marca, utilizado en tipografía de logotipo, cabeceras, botones primarios y bordes estructurales.
- **Azul Cerúleo Oceánico (`#307AA7` / `rgb(48, 122, 167)`):** Color de acento primario (cinta 3D), utilizado en estados interactivos, focos accesibles, barras de navegación y vínculos.
- **Ámbar Dorado (`#EAB01E` / `rgb(234, 176, 30)`):** Color de acento complementario (lazo entrelazado), utilizado en alertas informativas, insignias de estatus e indicadores de rol.
- **Pizarra Oscura (`#09253B` / `rgb(9, 37, 59)`):** Tono profundo para fondos de contenedores de aplicación, asistentes de instalación y temas de alto contraste.
- **Blanco Perla Superficie (`#F7FAFF` / `rgb(247, 250, 255)`):** Fondo limpio de tarjetas de trabajo, formularios y áreas de captura de datos.
- **Gris Neutro Accesible (`#475569` / `rgb(71, 85, 105)`):** Texto secundario y etiquetas con ratio de contraste superior a 7:1 (WCAG AAA).

### 1.2 Reglas de Optimización
- Ningún recurso visual en la interfaz web (`src/assets/brand/`) supera los **150 KB**.
- Todos los recursos son locales y empaquetados; no se realizan peticiones externas a CDNs.

---

## 2. Catálogo de Recursos en el Repositorio

| Archivo en el Repositorio | Origen Original | Uso en el Sistema | Dimensiones / Formato | Peso | Hash SHA-256 |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `src/assets/brand/atlob_logo_horizontal.webp` | `Logo Formato 1.jpg` | Logotipo principal en Login, Configuración Inicial y encabezados claros. | 700 × 261 px (WebP) | 57,760 B | `3E4FE23D9AAD8830F977D40A349E4BA5F7306969291C94A91742E6EDF7B870AC` |
| `src/assets/brand/atlob_logo_horizontal.png` | `Logo Formato 1.jpg` | Respaldo PNG transparente del logotipo horizontal. | 700 × 261 px (PNG) | 137,900 B | `A39874842BC761D1BDA724D7562C9BB98CC5C6E028E71550557230AD621D5BE0` |
| `src/assets/brand/atlob_logo_horizontal_blanco.webp` | `Logo Formato 1.jpg` & `Logo formato 6.jpg` | Logotipo con texto en blanco para fondos oscuros o barras de navegación. | 700 × 261 px (WebP) | 35,434 B | `AC1F44FE758261C8AFD96D637FDBCADE9BEE3E41B26E64F108AD9AAFC759D37A` |
| `src/assets/brand/atlob_logo_horizontal_blanco.png` | `Logo Formato 1.jpg` & `Logo formato 6.jpg` | Respaldo PNG con texto en blanco. | 700 × 261 px (PNG) | 120,064 B | `7E5A26956C3E5BB569A5BD73E1261435B186BD97EA7D20B1829045D48B619931` |
| `src/assets/brand/atlob_isotipo.webp` | `Isotipo.jpg` | Isotipo 3D transparente para modal Acerca de, diálogos y barras de título. | 256 × 256 px (WebP) | 13,214 B | `733BB5961C8F48A72B96DC6995FBE12C27AD0329FB0731523CDD9F6F3B3978FA` |
| `src/assets/brand/atlob_isotipo.png` | `Isotipo.jpg` | Respaldo PNG transparente del isotipo. | 256 × 256 px (PNG) | 51,321 B | `07D315B748AED3867CE1AD625F83815BA916C4F6A8AC1767B47AD532A4C689C4` |
| `src/assets/brand/atlob_app_icon_256.webp` | `Logo app.jpg` | Icono squircle de la aplicación para vistas de ayuda y splash screens. | 256 × 256 px (WebP) | 16,842 B | `0A6CE861E2BF7A082697843058D487AC4D92B95C3C04F090CA9C9781B7BE559C` |
| `src/assets/brand/atlob_app_icon_256.png` | `Logo app.jpg` | Respaldo PNG del icono squircle de la aplicación. | 256 × 256 px (PNG) | 56,128 B | `5C62BF05BF37F8EBC63EAF7E9F41E1BEB45EAA329FB6433F4CEB41D8B1C84073` |
| `desktop/build/icon.ico` | `Logo app.jpg` | Icono ejecutable de Windows (16, 24, 32, 48, 64, 128, 256 px). | Multi-resolución (ICO) | 86,658 B | `2BF1239C0E6DA0426CD215F79653B6B6F35A14A615B2E446B11FBC669E97F263` |
| `desktop/build/icon.png` | `Logo app.jpg` | Icono maestro 512 × 512 px para electron-builder y metadatos del instalador. | 512 × 512 px (PNG) | 187,983 B | `B74C2FEDA34C79EBF9B9384B04796009370039DB110FB2EA30B00E24C9403165` |
| `desktop/build/installerSidebar.bmp` | `Isotipo.jpg` & `Logo formato 6.jpg` | Imagen lateral de bienvenida y despedida del instalador NSIS. | 164 × 314 px (BMP 24bpp) | 154,542 B | `FE4304FD2BF5B188FFD7C182DE087F36264445C546C43CD96052982A0E7D2639` |
| `desktop/build/installerHeader.bmp` | `Isotipo.jpg` | Imagen de cabecera de las páginas intermedias del instalador NSIS. | 150 × 57 px (BMP 24bpp) | 25,818 B | `B7F3D147F43D682E64F741EB2C7048589E2C21B984448648075774A8650B742D` |
| `desktop/assets/atlob_logo_horizontal.png` | `Logo Formato 1.jpg` | Logotipo horizontal autónomo para el asistente de conexión `config.html`. | 700 × 261 px (PNG) | 137,900 B | `A39874842BC761D1BDA724D7562C9BB98CC5C6E028E71550557230AD621D5BE0` |
| `desktop/assets/atlob_isotipo.png` | `Isotipo.jpg` | Isotipo transparente autónomo para la ventana de conexión `config.html`. | 256 × 256 px (PNG) | 51,321 B | `07D315B748AED3867CE1AD625F83815BA916C4F6A8AC1767B47AD532A4C689C4` |
| `public/favicon.ico` | `Logo app.jpg` | Favicon para el navegador web (16, 32, 48 px). | Multi-resolución (ICO) | 6,852 B | `73BC88FEF29D996692384406A59CA1AEC67AB5464A8326BED10ECA02ED4D415D` |
| `public/favicon-32x32.png` | `Logo app.jpg` | Icono estándar de pestaña de navegador. | 32 × 32 px (PNG) | 2,093 B | `6E5687F1E2E22516AE645B4575F0F6AC4DEBB0A711D73AFA1BDE321382507449` |

