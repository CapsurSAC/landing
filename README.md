# Landing CAPSUR — captación por formulario

Landing de una sola pantalla con un formulario de tres preguntas que recoge
solicitudes de orientación. Frontend en **React + Vite + Tailwind**. El envío
del formulario puede ir a **Formspree** (sin servidor propio) o a un
**endpoint PHP** incluido en `server/`, pensado para cPanel sin Node.

---

## 1. Arranque rápido

```bash
npm install
cp .env.example .env     # rellena lo que uses (ver §3)
npm run dev              # http://localhost:5173
```

Si el formulario apunta al PHP propio, hace falta además PHP en otra terminal:

```bash
php -S localhost:8000 -t server
```

Vite ya redirige `/api` hacia ese puerto durante el desarrollo. En local el
PHP lee `server/config/.env` (o el `.env` de la raíz) y guarda los leads en
`server/storage/leads.csv`; ambas rutas están ignoradas por git. Hace falta
PHPMailer en `server/config/PHPMailer/` o `server/config/vendor/` (§9).

---

## 2. Qué edita cada archivo

| Quiero cambiar… | Archivo |
|---|---|
| Las opciones de los 3 selects | `src/data/opciones.js` |
| Las instituciones (nombre, logo y lo que se lee al voltear la tarjeta) | `src/data/instituciones.js` |
| Los colores de marca | `src/index.css` → bloque `@theme` |
| El giro de las tarjetas de instituciones | `src/index.css` → bloque "Tarjetas de instituciones" |
| Textos del hero y los 4 beneficios | `src/components/Hero.jsx` |
| Los 4 enlaces del encabezado | `src/data/programas.js` → `CATEGORIAS` (abren `programas.html` filtrada) |
| La página de programas: textos, fotos, categorías y área que marca "Me interesa" | `src/data/programas.js` (fotos en `public/programas/`) |
| El diseño de la página de programas | `src/PaginaProgramas.jsx` y `src/components/Programas.jsx` |
| Los 4 motivos de "¿Por qué formarte?" | `src/components/PorQueCapsur.jsx` |
| Adónde se envía el formulario, WhatsApp, píxel, GA4, URL del sitio | `.env` (ver §3) |
| El texto de la política de privacidad | `public/politica-de-privacidad.html` |
| El correo destino y el SMTP (solo con PHP propio) | `server/config/.env` |
| El contenido del correo que llega (solo con PHP propio) | `server/api/enviar.php` |

---

## 3. Variables del frontend (`.env`)

Se definen en un archivo `.env` en la raíz (copia de `.env.example`). Se leen
**al compilar**: después de cambiarlas hay que volver a ejecutar `npm run build`.
Todas acaban dentro del JavaScript público, así que aquí nunca van contraseñas.

| Variable | Para qué | Si se deja vacía |
|---|---|---|
| `VITE_FORM_ENDPOINT` | URL que recibe el formulario (§4) | Usa el PHP propio, `/api/enviar.php` |
| `VITE_WHATSAPP_NUMERO` | WhatsApp de atención, solo dígitos con código de país. El de la bandeja Grupo CAPSUR es `51938230986`, y es el que usa la imagen de Docker si no se indica otro | No aparece el botón de WhatsApp tras enviar |
| `VITE_META_PIXEL_ID` | ID del píxel de Meta (§5) | No se carga el píxel |
| `VITE_GA4_ID` | ID de medición de Google Analytics 4, `G-…` (§5) | No se carga GA4 |
| `VITE_URL_SITIO` | URL pública sin barra final, p. ej. `https://capsur.edu.pe` | La imagen de vista previa queda relativa y WhatsApp no la muestra (§6) |

---

## 4. Adónde va el formulario: Formspree o PHP propio

El formulario envía un JSON a `VITE_FORM_ENDPOINT`. Hay dos opciones:

### PHP propio (lo que está activo)

```ini
VITE_FORM_ENDPOINT=/api/enviar.php
```

Es el valor por defecto, también si la variable no existe. Requiere un hosting
con PHP (cPanel vale). Guarda cada lead en un CSV **antes** de intentar el
correo, limita envíos por IP, bloquea bots y envía por SMTP con `Reply-To` a la
persona. Configuración en §8 a §11. En local necesita `php -S localhost:8000 -t server`
en otra terminal (§1).

### Formspree (alternativa sin servidor)

```ini
VITE_FORM_ENDPOINT=https://formspree.io/f/mzerbvwg
```

No necesita servidor. A cambio: los datos de cada persona pasan por un tercero
en EE. UU. (hay que decirlo en la política de privacidad, §7), el plan gratuito
corta en 50 envíos al mes y no queda copia local de los leads.

En ambos casos el formulario incluye un campo trampa para bots: `_gotcha`
(el nombre que usa Formspree) y `website` (el que espera el PHP) viajan con el
mismo valor, así que la protección funciona sin tocar nada al cambiar de uno a otro.

---

## 5. Medición: píxel de Meta y GA4

`src/lib/analitica.js` carga el píxel y GA4 solo si sus variables están
definidas, y dispara dos eventos:

| Momento | Meta | GA4 |
|---|---|---|
| El formulario se envió con éxito | `Lead` (con `content_category` = área elegida) | `generate_lead` |
| Pulsa "Escribirnos por WhatsApp" en la pantalla de gracias | `Contact` | `contact` |

Para comprobarlo: instala la extensión **Meta Pixel Helper**, envía una prueba y
verifica que aparezca `Lead`. En el Administrador de eventos de Meta tarda unos
minutos en reflejarse. Usa `Lead` como evento de conversión en las campañas.

---

## 6. Imágenes y logos

| Archivo | Qué es | Notas |
|---|---|---|
| `public/hero-estudiantes.webp` | Foto del hero | WebP con transparencia, 865×1026 px (alta y estrecha, para que llene la tarjeta de arriba abajo), ~105 KB. La anterior está en `respaldo/`. |
| `public/og-capsur.jpg` | Vista previa al compartir el enlace | 1200×630 px, 96 KB. Generada a partir de la foto del hero. |
| `public/logos/*.webp` | Logos de las instituciones | 176 px de alto, sin aire alrededor. Los PNG originales están en `respaldo/logos/`. |

**Para que la vista previa salga en WhatsApp y Facebook**, `VITE_URL_SITIO`
debe estar definida: ambos exigen que `og:image` sea una URL absoluta. Tras
publicar, pasa la URL por el [depurador de Facebook](https://developers.facebook.com/tools/debug/)
para que refresque su caché.

**Para añadir una institución:**

1. Exporta el logo en WebP con fondo transparente y unos 176 px de alto.
2. Súbelo a `public/logos/` con un nombre en minúsculas y sin tildes.
3. Añade su entrada en `src/data/instituciones.js` con `nombre`, `descripcion`
   y `archivo` (el frente de la tarjeta), más `tipo`, `ofrece` y `modalidad`
   (lo que se lee al voltearla). `ofrece` lleva de 3 a 5 líneas cortas, para
   que el reverso no crezca. Usa solo datos que consten en la web oficial de
   la institución.

Las tarjetas no enlazan a ningún sitio externo: se voltean con clic, toque o
teclado y la visita sigue en la página, cerca del formulario.

El logo de CAPSUR es `public/logos/grupo-capsur.webp`; el pie lo invierte a
blanco con CSS, así que basta un solo archivo.

---

## 7. Política de privacidad

`public/politica-de-privacidad.html` es una plantilla alineada con la
**Ley 29733**. Antes de publicar:

1. Busca cada `« »` y reemplázalo con el dato real: razón social, RUC,
   domicilio, correo para derechos ARCO, código del banco de datos en el
   RNPDP, instituciones que reciben los datos, proveedor de envío y hosting.
2. En el punto 5 nombra al proveedor SMTP que uses (Brevo, Mailjet o el cPanel);
   si algún día cambias a Formspree, añádelo ahí como flujo transfronterizo.
3. Revísala con quien lleve el tema legal.

El checkbox del formulario enlaza a esa página. Si cambias el texto del
checkbox, sube `VERSION_CONSENTIMIENTO` en `src/data/opciones.js`: cada envío
guarda qué versión aceptó la persona.

---

## 8. Configurar el envío de correo (solo PHP propio)

### 8.1 Elegir el SMTP

| Proveedor | Gratis | Host | Puerto |
|---|---|---|---|
| **Brevo** (recomendado) | 300/día | `smtp-relay.brevo.com` | 587 |
| Mailjet | 200/día | `in-v3.mailjet.com` | 587 |
| cPanel propio | ilimitado | `mail.tudominio.com` | 465 |

Con Brevo hay que verificar el dominio y pedir a su soporte que active el relay
SMTP; es un trámite de una sola vez. Mailjet entrega las credenciales al
instante. El SMTP de cPanel no necesita nada, pero sale desde una IP compartida
y entrega peor.

### 8.2 Crear el `.env` del servidor

```bash
cp server/config/.env.example server/config/.env
```

Los dos valores que más importan:

```ini
MAIL_FROM=no-reply@tudominio.com   # SIEMPRE tu dominio
MAIL_TO=informes@tudominio.com     # donde quieres recibir los leads
```

> **Por qué `MAIL_FROM` debe ser tu dominio:** si pusieras ahí el correo de la
> persona que llena el formulario, romperías SPF y DMARC y el mensaje caería en
> spam. El correo del visitante viaja en `Reply-To`, así que al pulsar
> "Responder" le contestas directamente a él.

`PROXIES_CONFIANZA` casi siempre va vacía. El límite de envíos usa la IP de
la conexión y solo acepta la que anuncian las cabeceras cuando vienen de
Cloudflare o de un proxy de red privada (Docker/EasyPanel). Rellénala
únicamente si delante del servidor hay un proxy propio con IP pública.

### 8.3 Registros DNS

En cPanel → **Zone Editor**, añade los que te entregue el proveedor:

- **SPF** (TXT): autoriza al proveedor a enviar en nombre de tu dominio
- **DKIM** (TXT): firma criptográfica de los mensajes
- **DMARC** (TXT): empieza suave con
  `v=DMARC1; p=none; rua=mailto:dmarc@tudominio.com`

Sin estos tres, ningún proveedor SMTP evita la carpeta de spam.

---

## 9. Instalar PHPMailer (solo PHP propio)

**Con Terminal en cPanel:**

```bash
cd ~/config
composer require phpmailer/phpmailer
```

**Sin Terminal** (lo habitual en hosting compartido): descarga el ZIP de
[PHPMailer](https://github.com/PHPMailer/PHPMailer/releases), y de su carpeta
`src/` sube solo estos tres archivos a `config/PHPMailer/`:

```
Exception.php
PHPMailer.php
SMTP.php
```

El `bootstrap.php` detecta solo cuál de las dos formas usaste.

---

## 10. Subida a cPanel

```bash
npm run build        # genera dist/ con las variables de .env ya aplicadas
```

Estructura final en el servidor:

```
/home/usuario/
├── public_html/
│   ├── index.html                     ← de dist/
│   ├── assets/                        ← de dist/
│   ├── favicon.svg                    ← de dist/
│   ├── hero-estudiantes.webp          ← de dist/
│   ├── og-capsur.jpg                  ← de dist/
│   ├── politica-de-privacidad.html    ← de dist/
│   ├── logos/
│   │   ├── .htaccess                  ← de server/logos.htaccess
│   │   └── *.webp                     ← de dist/logos/
│   ├── api/
│   │   ├── enviar.php                 ← de server/api/   (solo PHP propio)
│   │   └── metricas.php               ← de server/api/   (medición, §12.3)
│   │                                  (reintentar.php NO se sube: es solo para Docker, §11.1)
│   ├── admin/                         ← toda la carpeta server/admin/ (§12)
│   │   ├── index.php                  (leads)
│   │   ├── metricas.php               (métricas y mapa de calor)
│   │   └── panel.css
│   └── .htaccess                      ← de server/.htaccess
├── config/                            ← FUERA de public_html (solo PHP propio)
│   ├── .env
│   ├── bootstrap.php
│   ├── bootstrap-min.php
│   ├── chatwoot.php                   (registro en Chatwoot, §11.1)
│   ├── reintentar-chatwoot.php        (lo corre el cron, §11.1)
│   ├── probar-smtp.php
│   ├── generar-hash.php
│   └── PHPMailer/  (o vendor/)
└── storage/                           ← FUERA de public_html (solo PHP propio)
    ├── leads.csv                      (se crea solo)
    ├── eventos.csv                    (clics del mapa de calor; se crea solo y se recorta al pasar de 20 MB)
    ├── envios/                        (una marca por envío, para no duplicar; se limpia a los 30 días)
    ├── chatwoot-pendientes/           (leads que esperan reintento hacia Chatwoot, §11.1)
    ├── chatwoot-hechos/               (envíos ya registrados en Chatwoot)
    ├── reparto-AAAA-MM-DD.json        (cuántos leads lleva cada asesor hoy)
    ├── visitas/                       (una visita por archivo; se limpia a los 90 días)
    └── rate/                          (se crea sola; también cuenta los intentos del panel)
```

Pasos:

1. Sube **el contenido** de `dist/` a `public_html/` (no la carpeta `dist` en sí).
2. Sube `server/.htaccess` a `public_html/.htaccess` y `server/logos.htaccess`
   a `public_html/logos/.htaccess` (ojo al nombre).
3. Solo con PHP propio: sube `server/api/enviar.php` a `public_html/api/`,
   `server/config/` a `/home/usuario/config/` (**un nivel por encima** de
   `public_html`) y crea `/home/usuario/storage/` con permisos **755**.

> **Lo crítico:** `config/` y `storage/` nunca deben quedar dentro de
> `public_html`. Si están fuera, no existe URL que los alcance; si están dentro,
> cualquiera podría descargar tu `.env` con las credenciales SMTP o el CSV con
> los datos de las personas. El `.env` de la raíz del proyecto no se sube:
> sus valores ya quedaron dentro de `dist/` al compilar.

### Probar el SMTP antes que nada (PHP propio)

```bash
php config/probar-smtp.php
```

Imprime la configuración que está leyendo, envía un correo de prueba y, si
falla, muestra el diálogo completo con el servidor y las causas más habituales.

Solo funciona por línea de comandos: abierto desde el navegador responde 404.
Sin Terminal en cPanel, créale un **trabajo cron** puntual con tu correo como
destino del resultado y bórralo al recibirlo. Nunca lo subas a `public_html`.

### Comprobación tras subir

- `https://tudominio.com` carga la landing.
- `https://tudominio.com/politica-de-privacidad.html` abre la política.
- Pega la URL en un chat de WhatsApp: debe salir la imagen de vista previa.
- Con PHP propio: `https://tudominio.com/api/enviar.php` por GET devuelve
  `{"ok":false,"error":"Método no permitido"}` y
  `https://tudominio.com/config/.env` da **403 o 404**.
- Envía una prueba desde el formulario y revisa que llegue el correo (y, con
  PHP propio, que aparezca la fila en `storage/leads.csv`).

### 10.b Alternativa: Docker (EasyPanel)

El `Dockerfile` arma una imagen con Apache + PHP 8.3 que trae todo lo de
arriba: la landing, `api/`, `admin/`, `config/` fuera de la web y PHPMailer
(lo instala Composer al construir). La configuración de Apache está en
`docker/apache-capsur.conf` y hace lo mismo que `server/.htaccess`, salvo
forzar HTTPS: de eso se encarga Traefik.

1. **Argumentos de build:** solo `VITE_META_PIXEL_ID` y `VITE_GA4_ID`, si se
   usan. Ya traen valor por defecto `VITE_URL_SITIO`
   (`https://formularios.corporacioncapsur.com`), `VITE_FORM_ENDPOINT`
   (`/api/enviar.php`) y `VITE_WHATSAPP_NUMERO` (`51938230986`, la bandeja
   Grupo CAPSUR); pásalos solo para cambiarlos.
2. **Variables de entorno** (EasyPanel → Environment): las mismas del `.env`
   del servidor (§8.2), es decir SMTP, `MAIL_*`, `ORIGENES_PERMITIDOS`,
   `ADMIN_USUARIO` y `ADMIN_HASH`, más las de Chatwoot (§11.1):
   `CHATWOOT_*` y `REINTENTO_TOKEN`. El `.env` no entra en la imagen.
   `PROXIES_CONFIANZA` se deja vacía: Traefik y Cloudflare se reconocen solos.
3. **Volumen persistente en `/var/www/storage`.** Sin él, cada redespliegue
   borra los leads, las métricas y los límites por IP.
4. Puerto 80 del contenedor detrás del dominio.
5. Son dos páginas: `/` (formulario) y `/programas.html`. El `Dockerfile` ya
   copia las dos; si se agrega otra, súmala allí y en `vite.config.js`.

Paso a paso para publicar: [`DESPLIEGUE.md`](DESPLIEGUE.md).

Las utilidades de `config/` se corren dentro del contenedor:

```bash
docker exec -it <contenedor> php /var/www/config/generar-hash.php "contraseña"
docker exec -it <contenedor> php /var/www/config/probar-smtp.php
```

Las comprobaciones son las mismas de la lista anterior.

### Origen del lead (UTM) y referencia de WhatsApp

`src/lib/origen.js` guarda las `utm_*` y el `fbclid` al llegar, y el formulario
los manda como campos propios junto a un `envio_id` y el código del área
(`COMP`, `MIN`…, en `src/data/opciones.js`). Quedan en `leads.csv` y en el
correo interno, y el panel muestra de qué correo vino cada lead. El mensaje de
WhatsApp lleva escritas las respuestas (nombre, área, objetivo e inicio) para
que el asesor las vea al atender, y termina en una línea `Ref: EM1-COMP`
(correo 1, Computación) que usa el flujo de Chatwoot para elegir la rama. El
correo de la persona no va en ese mensaje: el flujo busca `-COMP`, `-MIN`… en
todo el texto y una dirección como `ana-min@…` lo mandaría a otra rama. Si la
persona reintenta tras un error, el `envio_id` es el mismo y el lead no se
duplica; si el envío falla, el enlace de WhatsApp del aviso de error lleva las
mismas respuestas.

---

## 11. Qué hace el backend PHP

`server/api/enviar.php`, en orden:

1. Rechaza todo lo que no sea POST.
2. Comprueba que el origen esté en `ORIGENES_PERMITIDOS`.
3. Mira cuántos envíos válidos lleva esa IP (5 cada 15 minutos por defecto).
   La IP es la de la conexión: `X-Forwarded-For` y `CF-Connecting-IP` solo
   se creen si llegan desde Cloudflare o desde un proxy propio, porque esas
   cabeceras las puede escribir cualquiera. En IPv6 el límite va por bloque /64.
4. Si el campo trampa `website` viene lleno, responde `ok` y no envía nada: el
   bot no aprende que fue detectado.
5. Valida y limpia todos los campos. Quita saltos de línea, que son lo que
   permite inyectar cabeceras extra en un correo.
6. **Guarda la fila en `storage/leads.csv` antes de intentar el envío.** Si el
   SMTP falla, el registro ya está a salvo y la persona ve "Solicitud recibida":
   el lead se ve en el panel. Solo responde error si tampoco pudo guardarse.
   Sin `SMTP_HOST` o `MAIL_TO` no intenta el correo.
7. Si hay `CHATWOOT_TOKEN`, registra el lead en Chatwoot (§11.1). Lo que pase
   ahí no detiene el paso siguiente.
8. Envía el correo en HTML y texto plano, con `Reply-To` apuntando al visitante.

### 11.1 Registro en Chatwoot

Con `CHATWOOT_TOKEN` definido, cada solicitud queda como una conversación en
la bandeja API «CAPSUR - Formulario web». La lógica está en
`config/chatwoot.php`, fuera de la carpeta pública, y hace estas llamadas, con
un máximo de 10 segundos cada una:

1. Busca a la persona por teléfono (`+51987654321`) y, si no, por correo.
2. Si no existe, crea el contacto. Si existe, lo reutiliza y solo le actualiza
   el consentimiento (`consentimiento_datos`, `consentimiento_marketing`,
   `version_consentimiento`); el nombre no se toca.
3. Abre la conversación en la bandeja API con los atributos `origen_lead`,
   `utm_*`, `area_interes`, `objetivo` e `inicio`.
4. Deja una nota privada con todos los datos del formulario.
5. Pone las etiquetas: `formulario_web`, `lead_nuevo`, `area_xxx` y, si vino
   de un correo, `email_marketing` y `correo_N`.

| Variable | Qué es |
|---|---|
| `CHATWOOT_URL` | URL de Chatwoot, sin barra final |
| `CHATWOOT_ACCOUNT_ID` | Número de la cuenta (el de `/app/accounts/N/`) |
| `CHATWOOT_TOKEN` | Token de acceso del usuario «Integración formulario». Vacío = no se llama a Chatwoot |
| `CHATWOOT_INBOX_ID` | Id de la bandeja API «CAPSUR - Formulario web» |
| `CHATWOOT_ASIGNACION` | `inmediata` (por defecto) o `diferida` |
| `REINTENTO_TOKEN` | Solo Docker: clave de `api/reintentar.php`, de 16 caracteres o más |

El token es un secreto del servidor: va en el `.env` de `config/` (o en
EasyPanel → Environment), **nunca** en una variable `VITE_`.

**En Chatwoot hay que crear antes**, porque la API no los crea sola: la bandeja
API, el usuario «Integración formulario» con acceso solo a esa bandeja, las
etiquetas (`formulario_web`, `email_marketing`, `correo_1`…`correo_5`,
`lead_nuevo`, `por_asignar`, `area_comp`, `area_min`, `area_ind`,
`area_tur`, `area_edu`, `area_adm`, `area_mkt`, `area_neg`, `area_sal`,
`area_gen`) y los atributos personalizados de conversación y de contacto
nombrados arriba. Los asesores del reparto tienen que ser miembros de la bandeja.

**Asignación.** En modo `inmediata`, el lead se asigna al llegar con las mismas
cuotas del flujo de WhatsApp (tabla `CW_REPARTO` de `config/chatwoot.php`):
40/40/20 en Computación, Minería, Industria y Turismo, y 40/60 en el resto. La
cuenta se lleva por día en `storage/reparto-AAAA-MM-DD.json` y el lead va al
asesor más atrasado respecto de su cuota: diez leads de Computación quedan
4/4/2. En modo `diferida`, la conversación entra sin asesor y con la etiqueta
`por_asignar`.

**Si Chatwoot no responde,** la persona ve igual «¡Solicitud recibida!»: el
lead ya está en el CSV, sale el correo interno y queda un archivo en
`storage/chatwoot-pendientes/`. Se reintenta cada 15 minutos, hasta 12 veces
(unas 3 horas); después el archivo pasa a `.fallido` y se anota en el log de
errores. Cada reintento sigue donde quedó el anterior, así que no se duplican
contactos ni conversaciones. Para volver a intentar un `.fallido`, renómbralo
a `.json`.

Quién dispara los reintentos:

- **cPanel:** un cron cada 15 minutos.

  ```
  */15 * * * * php /home/usuario/config/reintentar-chatwoot.php
  ```

- **Docker:** el contenedor no trae cron. Un flujo de n8n hace cada 15 minutos
  un `POST` a `https://tudominio.com/api/reintentar.php` con la cabecera
  `X-Reintento-Token: <REINTENTO_TOKEN>`. Sin la clave correcta responde 404.
  A mano:

  ```bash
  docker exec -u www-data <contenedor> php /var/www/config/reintentar-chatwoot.php
  ```

  (con `-u www-data`, para no dejar en el volumen archivos que Apache no pueda escribir).

### Sobre los datos personales (Ley 29733)

El CSV guarda, junto a cada registro, la fecha, la IP y la versión del texto de
consentimiento que la persona aceptó. La casilla de marketing es
**independiente y opcional**, como exige la norma: no la hagas obligatoria ni
la marques por defecto.

---

## 12. Panel de leads

`server/admin/index.php` es un panel de una sola página para ver los leads del
CSV sin entrar a cPanel: resumen (total, hoy, últimos 7 días, área más pedida),
búsqueda por nombre, correo o WhatsApp, filtro por área y fechas, enlaces
directos a correo y WhatsApp, origen de la visita (UTM) y exportación a CSV.

### 12.1 Activarlo

1. Elige un usuario (un correo va bien) y una contraseña **larga**: una frase de
   cuatro palabras protege más que ocho símbolos.
2. Genera el hash de la contraseña. Desde el Terminal de cPanel, o en tu PC:

   ```bash
   php server/config/generar-hash.php "tu frase larga"
   ```

3. Pega en `config/.env` la línea que imprime y el usuario:

   ```ini
   ADMIN_USUARIO=tu-correo@dominio.com
   ADMIN_HASH=$argon2id$...
   ```

4. Sube `server/admin/index.php` a `public_html/admin/index.php`.
5. Entra en `https://tudominio.com/admin/`.

Mientras falten las dos variables, el panel muestra un aviso y no deja entrar.

### 12.2 Protecciones

- La contraseña nunca se guarda: solo su hash **Argon2id**.
- 5 intentos fallidos por IP cada 15 minutos; después, espera.
- El mensaje de error es el mismo con usuario o con contraseña incorrectos.
- Sesión con cookie `HttpOnly` + `Secure` + `SameSite=Strict`, que caduca a las
  2 horas; el identificador se renueva al entrar.
- Token CSRF para salir; la exportación solo funciona con sesión abierta.
- Política de contenido (CSP) sin scripts: aunque un dato de un visitante se
  pintara sin escapar, el navegador no lo ejecutaría.
- En los CSV (el guardado y los exportados), un valor que empiece con `=`,
  `+`, `-` o `@` lleva un apóstrofo delante para que Excel no lo ejecute
  como fórmula. Los teléfonos (`+51 987…`) quedan como están.
- No se puede incrustar en otra página (`X-Frame-Options: DENY`) ni queda en caché.

Si quieres un segundo candado, en cPanel → **Directory Privacy** puedes proteger
`public_html/admin/` con la autenticación básica de Apache: el navegador pedirá
usuario y contraseña antes de que el PHP llegue a ejecutarse.

### 12.3 Pestaña Métricas: qué tocan y hasta dónde llegan

`server/admin/metricas.php` muestra, para los últimos 7, 30 o 90 días:

- **Visitas** y cuántas empezaron el formulario, lo dejaron a medias o lo
  completaron, con la tasa de conversión, el tiempo medio activo, el scroll
  medio, el tiempo medio hasta enviar y cuántas ya habían venido antes.
- **Visitas y leads por día** (gráfico) y **cuándo entran** (cuadrícula por
  día de la semana y hora), para decidir a qué horas pautar y atender.
- **De dónde vienen**: fuente, medio y campaña (UTM de los anuncios, `fbclid`
  o sitio de procedencia) con visitas, a medias, leads y conversión de cada uno.
- **Embudo del formulario**: cuántas visitas llenaron cada campo, en orden.
  Donde cae la barra es donde la gente abandona. Al lado, **dónde se atascan**:
  último campo tocado antes de irse y errores de validación por campo.
- **Qué les interesa**: las respuestas elegidas en las tres preguntas, incluso
  de quien no envió, y cuántas de cada una acabaron en lead.
- **Qué secciones miran** y durante cuánto tiempo, y hasta dónde bajan.
- **Dónde hacen clic**: clics por sección y los 20 elementos más tocados
  (logos de instituciones, botones, opciones). Dispositivo, sistema y
  navegador, incluido el navegador interno de Facebook e Instagram.
- **Exportar visitas (CSV)**: una fila por visita con todo lo anterior.
- **Mapa de calor** dibujado sobre la propia landing: enlaces "Escritorio",
  "Tablet" y "Móvil" que abren `/?mapa=…` con las manchas de calor de los
  últimos 30 días. Míralo con una ventana del tamaño correspondiente, porque
  las posiciones dependen del ancho.
- **Se quedaron a medias y autorizaron el contacto**: nombre y correo de quien
  marcó la casilla de autorización pero no pulsó enviar, para escribirle.

**Regla de privacidad (Ley 29733):** el avance del formulario se registra
siempre, pero solo como "llenó el campo" o "lo dejó vacío", nunca el contenido.
El nombre y el correo se guardan únicamente desde que la persona marca la
casilla de autorización; si la desmarca, se borran. La política de privacidad
ya lo declara.

Cómo funciona: `src/lib/medicion.js` envía lotes de eventos a
`server/api/metricas.php` con `sendBeacon`, que no frena la página. El PHP
guarda un archivo por visita en `storage/visitas/` (se borran a los 90 días)
y una fila por clic en `storage/eventos.csv`. Límites: 600 lotes y 120
visitas nuevas por IP cada 15 minutos, 300 clics por visita, y `eventos.csv`
se recorta a los 10 MB más recientes cuando pasa de 20 MB.

### 12.3b Pestaña Posibles: quien llenó y no envió

El formulario guarda lo que la persona va escribiendo (`src/lib/borrador.js`):

- **En su navegador**, todo y durante 30 días. Si vuelve, encuentra el
  formulario como lo dejó, con el aviso "Recuperamos lo que dejaste a medias ·
  ¿No eres tú? Borrar". La casilla de autorización no se recupera: se vuelve a
  marcar.
- **En el servidor**, como *posible* (`api/posible.php` →
  `storage/posibles/<id>.json`), solo desde que marca la casilla de
  autorización (Ley 29733) y con algún dato de contacto. Si la desmarca o
  toca "Borrar", se elimina. Viaja 1,5 s después de que deja de escribir, o al
  cerrar la pestaña.

La pestaña **Posibles** del panel los lista (nombre, correo o WhatsApp, con
aviso si están incompletos, respuestas y origen) y los exporta a CSV. Cuando la
persona envía el formulario, `api/enviar.php` lo borra de Posibles y queda
solo en Leads. Los posibles sin cambios en 90 días se borran solos.

### 12.4 Lo que no hace

No marca leads como atendidos ni asigna asesores: es una vista del CSV. Para
ese seguimiento, exporta a una hoja de cálculo o conecta el formulario a tu
sistema de gestión de asesores. Tampoco graba sesiones en vídeo; si algún día
hace falta, Microsoft Clarity lo da gratis con una etiqueta en `index.html`.

---

## 13. Accesibilidad

El formulario sigue el patrón de validación nativa del navegador:

- Los errores aparecen **solo después** de que la persona interactúa con el
  campo o intenta enviar (`:user-invalid`), nunca al cargar la página.
- Cada error lleva **icono y texto**, no solo color.
- Formatos exigidos: el celular es peruano, de **9 dígitos que empiezan con 9**
  (con o sin `+51`, con espacios o guiones), y el correo debe terminar en un
  dominio completo (`.com`, `.pe`…). Las reglas están en `PATRON_CELULAR` y
  `PATRON_CORREO` de `src/components/FormularioLead.jsx` y se repiten en
  `server/api/enviar.php`: si cambias una, cambia la otra. Chrome compila
  `pattern` en modo estricto: dentro de `[...]` hay que escapar `( ) -`, o el
  navegador descarta el patrón entero y el campo deja de validar.
- Además se rechazan los celulares **evidentemente inventados**: un dígito
  repetido (`911 111 111`), una escalera (`987 654 321`, `912 345 678`) o un
  bloque repetido (`987 987 987`). La regla es `celularInventado()`, también
  duplicada: en `FormularioLead.jsx` y en `server/config/bootstrap-min.php`.
  Solo descarta los falsos más comunes; confirmar que un número existe exige
  enviarle un código de verificación.
- `aria-invalid` se mantiene sincronizado con el estado visual y los mensajes se
  anuncian por una región `aria-live` (ver `src/hooks/useValidacionAccesible.js`).
- Todos los controles tienen `<label>` visible y foco visible de alto contraste.
- Las tarjetas de instituciones se voltean igual con teclado que con el ratón
  (Enter o Espacio abren, Escape cierra y el foco acompaña al giro); la cara
  oculta queda fuera del orden de tabulación. Todas las animaciones se
  desactivan si el sistema pide reducir movimiento.
- El botón flotante de móvil queda fuera del orden de tabulación mientras está oculto.

---

## 13. Solución de problemas

| Síntoma | Causa habitual |
|---|---|
| No aparece el botón de WhatsApp tras enviar | `VITE_WHATSAPP_NUMERO` vacía, o no se recompiló tras definirla |
| El píxel no registra `Lead` | `VITE_META_PIXEL_ID` vacía, build sin recompilar, o un bloqueador de anuncios en tu navegador |
| Al compartir el enlace no sale imagen | `VITE_URL_SITIO` vacía (la ruta queda relativa), o la caché de Facebook: pásala por su depurador |
| El enlace de la política da 404 | Falta subir `politica-de-privacidad.html` desde `dist/` |
| El panel dice "no está configurado" | Faltan `ADMIN_USUARIO` o `ADMIN_HASH` en `config/.env` (§12.1) |
| El panel dice "Demasiados intentos" | 5 fallos seguidos desde tu IP; espera 15 minutos o borra `storage/rate/` |
| El panel sale vacío | Aún no hay `storage/leads.csv`, o `config/` y `storage/` no están al mismo nivel |
| Métricas no registra nada | Falta subir `api/metricas.php`, o `storage/` no tiene permiso de escritura |
| El mapa de calor avisa "Entra primero al panel" | La sesión del panel caducó o se abrió el mapa en otro dominio; entra en `/admin/` y vuelve a abrirlo |
| "Configuración incompleta" (PHP) | Falta `config/.env` o PHPMailer |
| El correo no llega (PHP) | Falta SPF/DKIM, o el proveedor aún no activó el relay |
| El correo llega a spam (PHP) | `MAIL_FROM` no es de tu dominio, o falta DKIM |
| Error 403 al enviar (PHP) | Tu dominio no está en `ORIGENES_PERMITIDOS` |
| "Ya enviaste varias solicitudes" a gente que no envió nada | El servidor ve a todos con la IP de un proxy de IP pública: ponla en `PROXIES_CONFIANZA` (§8.2) |
| Error 500 al enviar (PHP) | No se pudo escribir en `storage/` (permisos o falta el volumen) o no hay ninguna variable de configuración. Mira el error log |
| Llegan leads al panel pero no correos | `SMTP_HOST`/`MAIL_TO` vacíos o SMTP fallando: busca "CAPSUR: SMTP" en el log |
| La página carga en blanco | Subiste la carpeta `dist` en vez de su contenido |
| Los assets dan 404 | Revisa que `base: './'` siga en `vite.config.js` |

---

> Versiones anteriores de este documento describían un "modo editor" de
> instituciones y un escalado a pantalla completa con `zoom`. Este repositorio
> no incluye ninguna de las dos cosas: las instituciones se editan en
> `src/data/instituciones.js` y la página se desplaza con normalidad.
