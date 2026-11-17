# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# landing-sis · Next.js standalone
#   docker build -t landing-sis .
#   docker run -p 3000:3000 -v landing-data:/data --env-file .env landing-sis
#
# - Las variables NEXT_PUBLIC_* se incrustan en el bundle: van como build args.
# - ADMIN_USER, ADMIN_PASSWORD_HASH y ADMIN_SESSION_SECRET se leen al
#   ejecutar: van como variables de entorno del contenedor.
# - Los leads (SQLite) viven en /data: monta ahí un volumen persistente o se
#   pierden en cada despliegue.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

ARG NEXT_PUBLIC_WHATSAPP_NUMBER="51987867402"
ARG NEXT_PUBLIC_PRIVACY_POLICY_VERSION="2026-11"
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SHOW_MARKETING_CONSENT="0"
ARG NEXT_PUBLIC_EXPERIMENTS_ENABLED="true"
ENV NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_PRIVACY_POLICY_VERSION=$NEXT_PUBLIC_PRIVACY_POLICY_VERSION \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SHOW_MARKETING_CONSENT=$NEXT_PUBLIC_SHOW_MARKETING_CONSENT \
    NEXT_PUBLIC_EXPERIMENTS_ENABLED=$NEXT_PUBLIC_EXPERIMENTS_ENABLED

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
RUN pnpm run build && find .next/standalone -type f -name "*.map" -delete

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/data
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# Código propiedad de root (solo lectura para `node`); solo la caché y /data son escribibles.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p .next/cache /data && chown node:node .next/cache /data
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -T 4 -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
