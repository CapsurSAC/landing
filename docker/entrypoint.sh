#!/bin/sh
# Un volumen recién montado puede llegar con dueño root: Apache (www-data)
# tiene que poder escribir ahí los leads, las métricas y los límites por IP.
set -e
mkdir -p /var/www/storage
chown -R www-data:www-data /var/www/storage

# security.txt (RFC 9116): a quién avisar si alguien encuentra un fallo de
# seguridad. Solo existe si SEGURIDAD_CONTACTO tiene un correo o una URL.
if [ -n "$SEGURIDAD_CONTACTO" ]; then
    case "$SEGURIDAD_CONTACTO" in
        *@*) contacto="mailto:$SEGURIDAD_CONTACTO" ;;
        *)   contacto="$SEGURIDAD_CONTACTO" ;;
    esac
    mkdir -p /var/www/html/.well-known
    caduca=$(date -u -d '+1 year' '+%Y-%m-%dT00:00:00Z' 2>/dev/null || date -u '+%Y-12-31T00:00:00Z')
    printf 'Contact: %s\nExpires: %s\nPreferred-Languages: es, en\n' "$contacto" "$caduca" \
        > /var/www/html/.well-known/security.txt
fi

exec docker-php-entrypoint "$@"
