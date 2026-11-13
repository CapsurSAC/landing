#!/bin/sh
# Un volumen recién montado puede llegar con dueño root: Apache (www-data)
# tiene que poder escribir ahí los leads, las métricas y los límites por IP.
set -e
mkdir -p /var/www/storage
chown -R www-data:www-data /var/www/storage
exec docker-php-entrypoint "$@"
