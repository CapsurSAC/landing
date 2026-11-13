# Publicar la landing en EasyPanel

Hoy `formularios.corporacioncapsur.com` sirve la versión antigua: es un nginx
estático, sin PHP, y el formulario responde con error 405. Esta guía cambia ese
servicio por la versión nueva (Apache + PHP), que es la de esta carpeta.

Lo comprobé el 13/11/2026 con la misma imagen Docker que construye EasyPanel:
cargan el inicio, `programas.html`, las fotos y los logos; el formulario guarda
el lead y muestra "¡Solicitud recibida!"; `config/` y `storage/` responden 404.

---

## Antes de publicar (solo tú puedes hacerlo)

- [ ] **Política de privacidad.** En `public/politica-de-privacidad.html`
  completa cada dato entre « »: razón social, RUC, domicilio, código del banco de
  datos en el RNPDP, empresas que reciben los datos, proveedor del correo, país
  del servidor, plazo de conservación y correo de protección de datos. Es el texto
  que la persona acepta al marcar la casilla (Ley 29733).
- [ ] **Contraseña del panel.** Elige una frase larga para entrar a `/admin/`.
  Su hash se genera en el paso 5.

## 1. Subir el código

Sube esta carpeta al repositorio de GitHub del que tira EasyPanel, reemplazando
lo que haya. No hacen falta `node_modules/`, `dist/` ni `respaldo/`; el
`.gitignore` y el `.dockerignore` ya los dejan fuera.

## 2. Servicio en EasyPanel

- **Build:** Dockerfile, el de la raíz.
- **Argumentos de build:** ninguno obligatorio. Si usas píxel de Meta o GA4,
  pon `VITE_META_PIXEL_ID` y `VITE_GA4_ID`.
- **Puerto:** 80.
- **Dominio:** `formularios.corporacioncapsur.com`, con HTTPS.
- **Volumen:** monta uno persistente en `/var/www/storage`. **Sin él, cada
  redespliegue borra los leads.**

## 3. Variables de entorno

Mínimo para salir (el formulario guarda los leads y se ven en el panel):

```
ORIGENES_PERMITIDOS=https://formularios.corporacioncapsur.com
ADMIN_USUARIO=tu-correo@dominio.com
ADMIN_HASH=        (paso 5)
```

Para que además llegue un correo por cada lead:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@corporacioncapsur.com
MAIL_FROM_NOMBRE=Formulario web CAPSUR
MAIL_TO=correo-que-recibe@dominio.com
```

Sin SMTP el formulario funciona igual: el lead queda en el panel y la persona ve
"Solicitud recibida". Chatwoot (`CHATWOOT_*`, `REINTENTO_TOKEN`) puede esperar:
mientras `CHATWOOT_TOKEN` esté vacío no se usa (README §11.1).

## 4. Desplegar

Pulsa *Deploy* y espera a que termine el build, unos 2 minutos.

## 5. Contraseña del panel

En la consola del servicio:

```bash
php /var/www/config/generar-hash.php "tu frase larga"
```

Copia la línea que imprime en `ADMIN_HASH` y vuelve a desplegar.

## 6. Comprobar en el dominio

- [ ] El inicio carga y los 4 enlaces de la cabecera abren `programas.html`
  filtrada.
- [ ] "Me interesa" vuelve al formulario con el área marcada.
- [ ] Un celular de 12 dígitos da error; uno real de 9 dígitos, no.
- [ ] Al enviar sale "¡Solicitud recibida!" y el lead aparece en `/admin/`.
- [ ] Con SMTP: llega el correo. Si no llega, prueba con
  `php /var/www/config/probar-smtp.php` en la consola.
- [ ] `/config/.env` y `/storage/leads.csv` responden 404.
- [ ] Haz un segundo despliegue y revisa que el lead de prueba siga en el panel:
  así sabes que el volumen funciona.
