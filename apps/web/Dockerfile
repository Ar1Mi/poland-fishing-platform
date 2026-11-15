# syntax=docker/dockerfile:1
# Web image (T-30): the production build of the PWA served by Caddy, which also terminates
# HTTPS and proxies /api to the api service (Caddyfile). Build context: repository root.

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/shared packages/shared
COPY tsconfig.base.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter web... --filter .
COPY apps/web apps/web
# Map tiles of the build (docs/08-testing-and-infra.md → «Окружение»); empty — OpenStreetMap,
# which its tile policy allows for development only.
ARG VITE_MAP_TILE_URL=
ARG VITE_MAP_TILE_ATTRIBUTION=
ENV VITE_MAP_TILE_URL=${VITE_MAP_TILE_URL} \
    VITE_MAP_TILE_ATTRIBUTION=${VITE_MAP_TILE_ATTRIBUTION}
RUN pnpm --filter @lowisko/shared build && pnpm --filter web build

FROM caddy:2.10.2-alpine AS runtime
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist-caddy/security-headers.caddy /etc/caddy/security-headers.caddy
COPY --from=build /repo/apps/web/dist /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
