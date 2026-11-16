# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# crm-bridge-service · imagen multi-stage (B22, C15, B6)
# Se construye SIEMPRE desde la raíz del monorepo:
#   docker build -f apps/crm-bridge-service/Dockerfile -t capsur/crm-bridge-service .            (runtime)
#   docker build -f apps/crm-bridge-service/Dockerfile --target migrate -t capsur/crm-bridge-migrate .
# El contexto se filtra con apps/crm-bridge-service/Dockerfile.dockerignore.
#
# Etapas:
#   base     -> node:24-alpine + pnpm (corepack) + openssl (lo necesita Prisma)
#   build    -> instala solo el grafo del servicio, compila dependencias internas,
#               genera el cliente Prisma (linux-musl) y hace `pnpm deploy --prod`
#   migrate  -> imagen mínima con la CLI de Prisma y las migraciones; ejecuta
#               `prisma migrate deploy` y termina (job previo al despliegue)
#   runtime  -> node:24-alpine sin npm/corepack, usuario `node`, tini, HEALTHCHECK.
#               NO ejecuta migraciones al arrancar.
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-alpine
ARG SERVICE=crm-bridge-service
ARG PORT=3003

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true HUSKY=0
RUN apk add --no-cache openssl \
 && corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /repo

FROM base AS build
ARG SERVICE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/${SERVICE} ./apps/${SERVICE}
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@capsur/${SERVICE}..."
# Dependencias internas (api-contracts, config, nest-kit) en orden topológico,
# cliente Prisma para la plataforma de la imagen y build de Nest.
RUN pnpm --filter "@capsur/${SERVICE}^..." run build \
 && pnpm --filter "@capsur/${SERVICE}" run db:generate \
 && pnpm --filter "@capsur/${SERVICE}" run build
# Árbol de producción aislado: solo dependencias de runtime, sin devDependencies.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter "@capsur/${SERVICE}" deploy --prod --legacy --ignore-scripts --store-dir /pnpm/store /out \
 && rm -rf /out/dist /out/prisma/generated /out/src /out/test \
 && cp -r "apps/${SERVICE}/dist" /out/dist \
 && mkdir -p /out/prisma \
 && cp -r "apps/${SERVICE}/prisma/generated" /out/prisma/generated \
 && find /out -type f \( -name "*.map" -o -name "*.ts" -a ! -name "*.d.ts" \) -not -path "*/prisma/generated/*" -delete \
 && find /out/node_modules -type f \( -name "*.md" -o -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" \) -delete \
 && rm -f /out/prisma/generated/client/*.dll.node /out/prisma/generated/client/*darwin*
# Poda (B22): @sentry/node declara @sentry/bundler-plugins (webpack, rollup,
# esbuild, lightningcss, terser, CLI de Sentry) solo para sus subrutas
# /webpack|/rollup|/vite|/esbuild, que un servidor no usa. Prisma trae motores
# WASM/edge de todas las bases; el servicio usa el motor nativo linux-musl.
# La prueba de humo final hace require() de cada dependencia y del cliente
# Prisma: si la poda rompe algo, el build falla aquí y no en producción.
RUN cd /out/node_modules/.pnpm \
 && rm -rf @sentry+bundler-plugins@* sentry@* webpack@* webpack-sources@* rollup@* @rollup+* \
           esbuild@* @esbuild+* lightningcss@* lightningcss-* terser@* terser-webpack-plugin@* \
           oxc-parser@* @oxc-parser+* @oxc-project+* caniuse-lite@* browserslist@* \
           update-browserslist-db@* jest-worker@* schema-utils@* enhanced-resolve@* watchpack@* \
 && find . -path "*/@prisma/client/runtime/*" -type f \
      \( -name "*wasm*" -o -name "*edge*" -o -name "react-native*" -o -name "index-browser*" \) -delete \
 && cd /out/prisma/generated/client \
 && rm -f edge.js wasm.js wasm-*.mjs query_engine_bg.js query_engine_bg.wasm react-native.js index-browser.js \
          runtime/edge* runtime/wasm* runtime/react-native* runtime/index-browser* \
 && cd /out \
 && node -e "const p=require('./package.json');for(const d of Object.keys(p.dependencies||{})){try{require(d)}catch(e){if(['ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_REQUIRE_ESM'].includes(e.code))continue;console.error('Dependencia rota tras la poda: '+d+': '+e.message);process.exit(1)}}require('./prisma/generated/client');console.log('prueba de humo de dependencias: OK')"

# ----------------------------- job de migraciones ---------------------------
FROM ${NODE_IMAGE} AS migrate
ARG SERVICE
ENV NODE_ENV=production CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 \
    npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
RUN apk add --no-cache openssl tini
WORKDIR /migrate
COPY apps/${SERVICE}/package.json /tmp/service-package.json
# Misma versión de la CLI que el servicio (devDependencies.prisma, versión fijada).
RUN npm install --no-save --omit=optional "prisma@$(node -p "require('/tmp/service-package.json').devDependencies.prisma")" \
 && npm cache clean --force && rm -f /tmp/service-package.json
COPY apps/${SERVICE}/prisma/schema.prisma ./prisma/schema.prisma
COPY apps/${SERVICE}/prisma/migrations ./prisma/migrations
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./node_modules/.bin/prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

# --------------------------------- runtime ---------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG PORT
ENV NODE_ENV=production PORT=${PORT}
RUN apk add --no-cache openssl tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# Archivos propiedad de root y solo lectura para `node` (compatible con read_only).
COPY --from=build /out ./
USER node
EXPOSE ${PORT}
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -T 4 -O /dev/null "http://127.0.0.1:${PORT}/internal/health" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
