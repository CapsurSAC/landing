# Publicar la landing en EasyPanel

Hoy `formularios.corporacioncapsur.com` sirve la versión antigua: un nginx
estático, sin PHP, donde el formulario responde con error 405. Esta guía lo
cambia por la versión nueva (Apache + PHP), que es la de este repositorio.

Comprobado el 13/11/2026 con la misma imagen Docker que construye EasyPanel:
la prueba de humo (`node scripts/prueba-humo.mjs`) pasa entera.

Son tres páginas: `/` (formulario), `/programas` (con `/programas/capacitacion`
y las demás categorías) y `/libro-de-reclamaciones.html`. El panel está en `/admin/`.

---

## Antes de publicar (solo CAPSUR puede hacerlo)

- [ ] **Política de privacidad.** En `public/politica-de-privacidad.html`
  completa cada dato entre « »: razón social, RUC, domicilio, código del banco
  de datos en el RNPDP, empresas que reciben los datos, proveedor del correo,
  país del servidor, plazo de conservación y correo de protección de datos.
- [ ] **Libro de Reclamaciones.** En `src/data/empresa.js`: razón social, RUC y
  dirección. Si quedan los « », la página pública los muestra tal cual.
- [ ] **Contraseña del panel.** Elige una frase larga (12 caracteres o más).

## 1. Código

EasyPanel construye desde `https://github.com/CapsurSAC/landing-page`. Las
mejoras están en la rama `mejoras-90`: revisa el pull request y, cuando estés
conforme, fusiónalo en `main`. Si EasyPanel despliega solo al cambiar `main`,
ten listas antes las variables del paso 3.

## 2. Servicio en EasyPanel

- **Build:** Dockerfile, el de la raíz.
- **Puerto:** 80.
- **Dominio:** `formularios.corporacioncapsur.com`, con HTTPS.
- **Volumen:** uno persistente en `/var/www/storage`. **Sin él, cada redespliegue
  borra los leads, los posibles y las hojas de reclamación.**

## 3. Variables

### Mínimas para salir

| Variable | Valor |
|---|---|
| `ORIGENES_PERMITIDOS` | `https://formularios.corporacioncapsur.com` |
| `ADMIN_USUARIO` | tu correo |
| `ADMIN_HASH` | lo da el paso 5 |

Con solo esto el formulario guarda los leads, la persona ve "Solicitud recibida"
y todo aparece en el panel. Sin estas variables el formulario responde error.

### Correo (muy recomendado)

| Variable | Para qué |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor de correo (Brevo: `smtp-relay.brevo.com`, 587) |
| `MAIL_FROM`, `MAIL_FROM_NOMBRE` | Remitente: una dirección del dominio propio |
| `MAIL_TO` | Quién recibe cada lead (varios, separados por coma) |
| `RECLAMOS_TO` | Quién recibe las hojas de reclamación (si falta, `MAIL_TO`) |
| `CORREO_CONFIRMACION` | `0` para no mandar la confirmación a la persona (por defecto sí se manda) |
| `EMPRESA_RAZON_SOCIAL`, `EMPRESA_RUC`, `EMPRESA_DIRECCION` | Van en la copia por correo del reclamo |

### Opcionales: cada una enciende algo

| Variable | Qué enciende |
|---|---|
| `ADMIN_TOTP` | Segundo factor del panel (paso 5) |
| `PANEL_IPS` | El panel solo existe para esas IPs o rangos |
| `TURNSTILE_SECRET` + argumento de build `VITE_TURNSTILE_SITE_KEY` | Anti-bots de Cloudflare (claves gratis en dash.cloudflare.com → Turnstile) |
| `AVISO_WEBHOOK_URL` | Aviso al instante por cada lead (un webhook de n8n que lo pase a Telegram o WhatsApp) |
| `SHEETS_WEBHOOK_URL` | Copia de cada lead en Google Sheets (un Apps Script publicado como aplicación web) |
| `RESPALDO_CLAVE` (32 caracteres o más), `RESPALDO_CONSERVAR` | Copias de seguridad cifradas (paso 7) |
| `SEGURIDAD_CONTACTO` | Correo para `/.well-known/security.txt` |
| `RETENCION_MESES` | Meses que se guardan los leads (24 por defecto, como dice la política) |
| `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_TOKEN`, `CHATWOOT_INBOX_ID`, `REINTENTO_TOKEN`, `REINTENTO_IPS` | Registro de leads en Chatwoot (README §11.1) |
| Argumento de build `VITE_URL_AGENDA` | Botón "Prefiero agendar una llamada" tras enviar |
| Argumentos de build `VITE_META_PIXEL_ID`, `VITE_GA4_ID` | Píxel de Meta y Google Analytics 4 |

Los avisos por webhook mandan nombre y contacto a otro servicio: si los activas,
nómbralo en el punto 5 de la política de privacidad.

## 4. Desplegar

Pulsa *Deploy* y espera unos 2 minutos. El contenedor trae un chequeo de salud
(`/api/salud.php`): si el volumen no se puede escribir, EasyPanel lo marca en rojo.

## 5. Contraseña y segundo factor del panel

En la consola del servicio:

```bash
php /var/www/config/generar-hash.php "tu frase larga"
```

Copia la línea en `ADMIN_HASH`. Para el segundo factor (recomendado):

```bash
php /var/www/config/generar-totp.php
```

Agrega la clave en tu app de autenticación, copia la línea en `ADMIN_TOTP` y
vuelve a desplegar.

## 6. Comprobar en el dominio

Desde tu PC, con el sitio ya publicado (crea un lead, un posible y una hoja de
reclamación de prueba; bórralos luego desde el panel, en "Datos personales"):

```bash
node scripts/prueba-humo.mjs https://formularios.corporacioncapsur.com
```

Y a mano:

- [ ] Los 4 enlaces de la cabecera abren `/programas/<categoría>`.
- [ ] "Me interesa" vuelve al formulario con el área marcada.
- [ ] Al enviar sale "¡Solicitud recibida!" y el lead aparece en `/admin/`.
- [ ] Con SMTP: llegan el correo interno y la confirmación a la persona.
- [ ] El pie muestra "Libro de Reclamaciones" y la hoja llega a la pestaña Reclamaciones.
- [ ] Haz un segundo despliegue y revisa que el lead de prueba siga ahí: el volumen funciona.

## 7. Copias de seguridad

Programa en EasyPanel (o en n8n con un comando) una vez al día:

```bash
php /var/www/config/respaldo.php
```

Deja un `.tar.gz.enc` cifrado en `/var/www/storage/respaldos` y conserva los
últimos 14. **Cópialo fuera del servidor** (rclone a Google Drive, o descárgalo):
si se pierde el servidor, se pierde también la copia. Para abrir uno:
`php config/respaldo.php --abrir archivo.tar.gz.enc salida.tar.gz`.

## 8. Fuera del código (recomendado)

- **Cloudflare** delante del dominio: firewall y bloqueo de bots gratis.
- **DNS del correo:** SPF, DKIM y DMARC (`p=quarantine`) para el dominio de `MAIL_FROM`.
- **Monitor externo** (UptimeRobot, gratis) sobre `/api/salud.php`.
- Cuando todos los subdominios usen HTTPS: HSTS con `includeSubDomains; preload`.
