# syntax=docker/dockerfile:1.7

# Build with the repository root as context: the web build copies
# packs/dist into web/public/packs.

# — build stage —
FROM node:24-alpine AS build
WORKDIR /src/web

# The browser calls the server directly, so its public URL is baked into the
# bundle. An unset value would silently aim the frontend at the default.
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" || { echo "VITE_API_URL build argument is required" >&2; exit 1; }

# Corepack reads the pnpm version from the packageManager field
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY web/ ./
COPY packs/dist/ /src/packs/dist/
RUN pnpm build

# — runtime stage —
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 8080
# Routes are hash-based: the default nginx config serves them as is
