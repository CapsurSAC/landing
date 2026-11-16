# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# web-sis · Next.js standalone (B22, C15)
# Se construye desde la raíz del monorepo:
#   docker build -f apps/web-sis/Dockerfile -t capsur/web-sis .
# El contexto se filtra con apps/web-sis/Dockerfile.dockerignore.
#
# Las variables NEXT_PUBLIC_* se incrustan en el bundle: van como build args.
# En runtime el sistema de archivos puede ser de solo lectura; Next escribe su
# caché en .next/cache, que el compose monta como tmpfs.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true HUSKY=0 NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_API_BASE_URL=""
ARG NEXT_PUBLIC_WHATSAPP_NUMBER="51987867402"
ARG NEXT_PUBLIC_PRIVACY_POLICY_VERSION="2026-11"
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SHOW_MARKETING_CONSENT="0"
# Pruebas A/B de hero y orden de promociones (A18)
ARG NEXT_PUBLIC_EXPERIMENTS_ENABLED="true"
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_PRIVACY_POLICY_VERSION=$NEXT_PUBLIC_PRIVACY_POLICY_VERSION \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SHOW_MARKETING_CONSENT=$NEXT_PUBLIC_SHOW_MARKETING_CONSENT \
    NEXT_PUBLIC_EXPERIMENTS_ENABLED=$NEXT_PUBLIC_EXPERIMENTS_ENABLED
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/web-sis ./apps/web-sis
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@capsur/web-sis..."
RUN pnpm --filter "@capsur/web-sis^..." run build \
 && pnpm --filter @capsur/web-sis run build \
 && find apps/web-sis/.next/standalone -type f -name "*.map" -delete

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# Código propiedad de root (solo lectura para `node`); solo la caché es escribible.
COPY --from=build /repo/apps/web-sis/.next/standalone ./
COPY --from=build /repo/apps/web-sis/.next/static ./apps/web-sis/.next/static
COPY --from=build /repo/apps/web-sis/public ./apps/web-sis/public
RUN mkdir -p apps/web-sis/.next/cache && chown node:node apps/web-sis/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -T 4 -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web-sis/server.js"]
