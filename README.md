# landing-sis

Landing de captación de **IEST Privado Sistemas del Sur (SIS)** con panel de gestión. Next.js 16 + React 19 + Tailwind CSS 4. Proyecto independiente: **no necesita Docker ni un servidor de base de datos** (los leads van a un archivo SQLite con el módulo incorporado de Node).

## Cómo funciona

- **Formulario de catálogo:** abre WhatsApp con un mensaje que lleva nombre, carrera y promoción. El lead se guarda en la base (`POST /api/leads`) **aunque no pulse WhatsApp**: mientras escribe (1,2 s después de la última tecla, y al cerrar la página) se guarda como «a medias», siempre que la casilla de autorización de contacto siga marcada. Al pulsar WhatsApp el mismo lead pasa a «lo abrió».
- **Borrador:** lo que escribió queda en el navegador (`localStorage`); si recarga o vuelve otro día, el formulario aparece como lo dejó, con la promoción y la carrera elegidas.
- **Panel `/admin`:** login con usuario y contraseña; resumen (total, sin atender, hoy, últimos 7 días, carrera más pedida), filtros por texto, carrera, promoción, estado y fechas, tabla de leads con enlace directo a su WhatsApp, estado editable (Nuevo, Contactado, Matriculado, Descartado) y exportar a CSV.
- **Libro de Reclamaciones** (`/libro-de-reclamaciones`) y **derechos ARCO** (`/derechos-arco`): generan un código (`SIS-LR-2026-XXXXX` / `SIS-ARCO-2026-XXXXX`) y la fecha límite en días hábiles (15 y 20). Luego abren WhatsApp con la hoja completa y permiten imprimirla o guardarla como PDF.
- **Métricas:** los eventos (`landing_viewed`, `promotion_selected`, `form_started`, `form_submitted`…) se publican en `window.dataLayer`. Si instalas Google Tag Manager, los recoge solo; sin GTM no hacen nada.

## Requisitos

Node.js 22 o superior. pnpm viene con Node vía `corepack`.

## Comandos

```bash
corepack pnpm install     # una vez
corepack pnpm dev         # http://localhost:3000
corepack pnpm build       # build de producción
corepack pnpm start       # sirve el build en :3000
corepack pnpm test        # pruebas unitarias
```

## Configurar el panel

En `.env`:

```bash
ADMIN_USER=tu-correo@dominio.com
ADMIN_PASSWORD_HASH=...      # node scripts/hash-password.mjs "tu-contraseña"
ADMIN_SESSION_SECRET=...     # el mismo script imprime uno
DATA_DIR=./data              # dónde se guarda landing.db
```

Reinicia el servidor después de cambiarlos. Seguridad: la contraseña solo se guarda como hash (scrypt), 5 intentos por IP cada 15 minutos, sesión firmada HttpOnly + SameSite=Strict que caduca a las 8 horas, y el panel no se indexa en buscadores.

## Qué editar

| Qué | Dónde |
| --- | --- |
| Número de WhatsApp | `NEXT_PUBLIC_WHATSAPP_NUMBER` en `.env` (sin `+`) |
| Promociones, precios y especialidades | `src/lib/fallback-catalog.ts` |
| Fechas de inicio, testimonios, preguntas frecuentes | `src/content/` |
| Dirección, teléfono, RUC, correo | `src/content/institution.ts` |
| Feriados para los plazos | `src/lib/filing.ts` (`PERU_HOLIDAYS`, hay que agregar los de cada año) |
| Texto del mensaje de WhatsApp | `src/lib/whatsapp.ts` y `src/lib/compliance-forms.ts` |

## Publicar

Hace falta un hosting que corra Node.js 22+ **con disco persistente** para `DATA_DIR`: un VPS o EasyPanel (con un volumen montado en la carpeta de datos). En Vercel o Netlify los leads se perderían, porque su disco se borra en cada despliegue. Haz copia de `landing.db` periódicamente.

### EasyPanel (con el `Dockerfile` de la raíz)

1. **Fuente:** este repositorio, rama `main`. **Build:** Dockerfile (`Dockerfile` en la raíz).
2. **Entorno:** `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` (genera los dos últimos con `node scripts/hash-password.mjs "tu-contraseña"`) y `NEXT_PUBLIC_SITE_URL=https://tu-dominio`. Cambiar una `NEXT_PUBLIC_*` exige volver a desplegar.
3. **Montajes:** un volumen en `/data`. Sin él, los leads se borran en cada despliegue.
4. **Dominio:** puerto `3000`, con HTTPS. La cookie del panel es `Secure`: por `http://` no se puede iniciar sesión.

## Límites conocidos

- Los reclamos y solicitudes ARCO todavía no se guardan en el panel: solo llegan si se envía el mensaje.
- Guardar datos de un formulario a medias es tratamiento de datos personales: conviene que la política de privacidad lo diga y que legal lo valide.
- Un solo usuario de panel. Para varios asesores con su propia cuenta habría que ampliarlo.
- Los códigos de reclamo son aleatorios, no correlativos. Si INDECOPI exige numeración correlativa o la copia por correo al consumidor, hace falta un backend.
- `src/contracts/` son los esquemas de datos heredados de la plataforma original; la landing solo usa sus tipos.
- Las pruebas e2e de `e2e/` se escribieron para la versión con backend y no están actualizadas.
