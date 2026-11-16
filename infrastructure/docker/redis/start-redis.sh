#!/bin/sh
# ---------------------------------------------------------------------------
# Arranque de Redis de PRODUCCIÓN: genera el archivo ACL a partir de la
# plantilla users.acl y de las contraseñas en variables de entorno (se guarda
# solo el SHA-256), y arranca redis-server SIN persistencia (C22: Redis solo
# guarda claves efímeras con TTL: límites de tasa e idempotencia).
# ---------------------------------------------------------------------------
set -eu

TEMPLATE=/usr/local/etc/redis/users.acl
OUT=/tmp/users.acl

sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

: "${PROMOTIONS_REDIS_PASSWORD:?}" "${LEADS_REDIS_PASSWORD:?}"
: "${REDIS_HEALTHCHECK_PASSWORD:?}" "${REDIS_ADMIN_PASSWORD:?}"

sed \
  -e "s/__PROMOTIONS_REDIS_PASSWORD_SHA256__/$(sha "$PROMOTIONS_REDIS_PASSWORD")/" \
  -e "s/__LEADS_REDIS_PASSWORD_SHA256__/$(sha "$LEADS_REDIS_PASSWORD")/" \
  -e "s/__REDIS_HEALTHCHECK_PASSWORD_SHA256__/$(sha "$REDIS_HEALTHCHECK_PASSWORD")/" \
  -e "s/__REDIS_ADMIN_PASSWORD_SHA256__/$(sha "$REDIS_ADMIN_PASSWORD")/" \
  "$TEMPLATE" | grep -v '^#' | grep -v '^[[:space:]]*$' > "$OUT"
chmod 600 "$OUT"

exec redis-server \
  --aclfile "$OUT" \
  --save "" \
  --appendonly no \
  --maxmemory "${REDIS_MAXMEMORY:-128mb}" \
  --maxmemory-policy volatile-lru \
  --protected-mode yes
