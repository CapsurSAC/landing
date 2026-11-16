# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# admin-web · panel interno (Next.js standalone, puerto 3004) (B22, C15, A1)
# Se construye desde la raíz del monorepo:
#   docker build -f apps/admin-web/Dockerfile -t capsur/admin-web .
# Requisito en apps/admin-web/next.config.ts (equipo admin-web):
#   output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined
# y una ruta GET /api/health que responda 200 sin sesión.
# No se publica en el dominio de la landing: va en un host propio
# (admin.<dominio>) con allowlist de IP opcional en el gateway.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true HUSKY=0 NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/admin-web ./apps/admin-web
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@capsur/admin-web..."
RUN pnpm --filter "@capsur/admin-web^..." run build \
 && pnpm --filter @capsur/admin-web run build \
 && mkdir -p apps/admin-web/public \
 && find apps/admin-web/.next/standalone -type f -name "*.map" -delete

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3004 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
COPY --from=build /repo/apps/admin-web/.next/standalone ./
COPY --from=build /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build /repo/apps/admin-web/public ./apps/admin-web/public
RUN mkdir -p apps/admin-web/.next/cache && chown node:node apps/admin-web/.next/cache
USER node
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -T 4 -O /dev/null http://127.0.0.1:3004/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/admin-web/server.js"]
