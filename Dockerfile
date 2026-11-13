# syntax=docker/dockerfile:1
# ══════════════════════════════════════════════════════════════
#  Landing CAPSUR — imagen de producción
#
#  Frontend compilado con Vite + backend PHP propio (formulario,
#  panel /admin/ y métricas) servidos por Apache con PHP 8.3.
#
#  Dentro del contenedor se replica la estructura de cPanel:
#    /var/www/html     lo público: dist/, api/ y admin/
#    /var/www/config   los PHP de configuración (fuera de la web)
#    /var/www/storage  leads.csv, métricas y límites  ← VOLUMEN
#
#  Construir:  docker build -t landing-capsur \
#                --build-arg VITE_URL_SITIO=https://formularios.corporacioncapsur.com .
#  Ejecutar:   docker run -d -p 8080:80 --env-file server/config/.env \
#                -v capsur-storage:/var/www/storage --name landing-capsur landing-capsur
#  Abrir:      http://localhost:8080
#
#  Sin el volumen en /var/www/storage, cada redespliegue borra los leads.
# ══════════════════════════════════════════════════════════════

# ── 1. Build del frontend ─────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Variables públicas del frontend: quedan dentro del JavaScript compilado.
# Aquí nunca van contraseñas ni tokens.
ARG VITE_FORM_ENDPOINT=/api/enviar.php
# WhatsApp de la bandeja Grupo CAPSUR (+51 938 230 986).
ARG VITE_WHATSAPP_NUMERO=51938230986
ARG VITE_URL_SITIO=https://formularios.corporacioncapsur.com
ARG VITE_META_PIXEL_ID=
ARG VITE_GA4_ID=

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html programas.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build


# ── 2. PHPMailer ──────────────────────────────────────────────
FROM composer:2.8 AS phpmailer
WORKDIR /deps
RUN composer require --no-interaction --no-progress --prefer-dist phpmailer/phpmailer:6.9.3


# ── 3. Apache + PHP ───────────────────────────────────────────
FROM php:8.3-apache

RUN a2enmod rewrite headers expires \
 && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && printf 'expose_php = Off\ndate.timezone = America/Lima\n' > "$PHP_INI_DIR/conf.d/capsur.ini"

# "zz-": se carga después del security.conf de Debian, que si no pisa ServerTokens.
COPY docker/apache-capsur.conf /etc/apache2/conf-enabled/zz-capsur.conf
COPY docker/entrypoint.sh /usr/local/bin/capsur-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/capsur-entrypoint && chmod +x /usr/local/bin/capsur-entrypoint

# Lo público
COPY --from=build /app/dist/ /var/www/html/
COPY server/api/ /var/www/html/api/
COPY server/admin/ /var/www/html/admin/

# Configuración, fuera de la web. El .env NO entra en la imagen: las
# variables se cargan en EasyPanel → Environment (ver .dockerignore).
COPY server/config/ /var/www/config/
COPY --from=phpmailer /deps/vendor/ /var/www/config/vendor/

RUN mkdir -p /var/www/storage \
 && chown -R www-data:www-data /var/www/storage

VOLUME /var/www/storage
EXPOSE 80

# El HTTPS lo pone Traefik delante; aquí se comprueba solo que Apache y PHP responden.
HEALTHCHECK --interval=30s --timeout=5s \
  CMD php -r 'exit(@file_get_contents("http://127.0.0.1/") === false ? 1 : 0);'

ENTRYPOINT ["capsur-entrypoint"]
CMD ["apache2-foreground"]
