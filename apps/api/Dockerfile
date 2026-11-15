# syntax=docker/dockerfile:1
# API image (T-30, docs/08-testing-and-infra.md → «Docker Compose»). Build context: repository root.
#   target `migrate`  — one-shot: `prisma migrate deploy`, then `prisma db seed` (species, general
#                       rules; demo data with SEED_DEMO=true). Needs the dev tools (prisma, tsx).
#   target `runtime`  — `node dist/main.js` with production dependencies only.

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    # `prepare` of the root package runs husky: there is no .git in the image.
    HUSKY=0
# The schema engine of `prisma migrate` links OpenSSL; the slim image has none.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first: the dependency layer is rebuilt only when they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# postinstall of api runs `prisma generate`: the schema and its config must be there.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
COPY packages/shared packages/shared
COPY tsconfig.base.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api... --filter .
COPY apps/api apps/api
RUN pnpm --filter @lowisko/shared build && pnpm --filter api build

FROM build AS migrate
WORKDIR /repo/apps/api
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec prisma db seed"]

FROM build AS prune
# A self-contained copy of the api package with production dependencies; the workspace
# package @lowisko/shared is copied in as a dependency.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist \
 && rm -rf /out/src /out/test /out/prisma /out/Dockerfile /out/nest-cli.json /out/prisma.config.ts \
    /out/tsconfig.json /out/tsconfig.build.json

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=prune --chown=node:node /out ./
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
