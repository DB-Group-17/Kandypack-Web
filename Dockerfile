# syntax=docker/dockerfile:1
#
# Kandypack production image (Next.js standalone output).
#
# Multi-stage build:
#   1. deps    - installs ALL npm dependencies (the build needs devDependencies such as Tailwind
#                and babel-plugin-react-compiler).
#   2. builder - runs `next build`, producing `.next/standalone` (see `output: "standalone"` in
#                next.config.ts).
#   3. runner  - minimal runtime image: only the standalone server, static assets and `public/`.
#
# The image is built in CI (never on the 2 GB production server) and holds NO secrets. All runtime
# configuration (DATABASE_URL, JWT_SECRET, UPSTASH_*) is injected by docker compose from the env
# file on the server. Authority: Docs/03_architecture.md §4, §12, §15.

# Node 22 LTS: Node 20 reached end of life in April 2026, and Next.js 16 needs Node >= 20.9.
ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Stage 1: install dependencies
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app

# Copy only the manifests first so this layer is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: build the application
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# BUILD-TIME PLACEHOLDER ONLY. lib/db.ts creates the MySQL pool when the module is imported and
# throws if DATABASE_URL is empty, and `next build` imports every route while collecting page
# data. mysql2 connects lazily, so this unreachable address is never contacted. The value is set
# in this stage only; the runner stage starts from a clean base, so it never reaches the final
# image. The real value is supplied at runtime.
ENV DATABASE_URL="mysql://build:build@127.0.0.1:3306/build"

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: minimal runtime image
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app

# HOSTNAME=0.0.0.0 is required: the standalone server otherwise binds to the container's own
# hostname only and the reverse proxy could not reach it from another container.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output does not include `public/` or `.next/static`, so copy them next to server.js.
# Files are owned by the unprivileged `node` user that ships with the official Node image.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Never run the application as root.
USER node

EXPOSE 3000

# Container health: the public /login page must answer with a 2xx. docker compose and the deploy
# job use this status to confirm a new release is serving before the old one is considered gone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
