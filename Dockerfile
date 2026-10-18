# HospitAI — production image (Vercel is the primary target; this image is for
# the Edge Box / self-hosted deployments).
#
# Multi-stage: deps (all dependencies, needed to compile TS/Tailwind)
#           -> builder (next build with output: "standalone")
#           -> runner (only the standalone server, static assets and public/)
#
# Build:  docker build -t hospitai .
# Run:    docker run -p 3000:3000 --env-file .env.production hospitai

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies ARE required at build time (typescript, tailwindcss, postcss).
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts next-env.d.ts ./
COPY src/ ./src/
COPY public/ ./public/
# Build-time public env vars (safe to bake; they are public by definition).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Security: run as non-root user
RUN addgroup --system --gid 1001 hospitai && \
    adduser --system --uid 1001 hospitai

# Standalone output contains server.js and a pruned node_modules.
COPY --from=builder --chown=hospitai:hospitai /app/.next/standalone ./
COPY --from=builder --chown=hospitai:hospitai /app/.next/static ./.next/static
COPY --from=builder --chown=hospitai:hospitai /app/public ./public

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

USER hospitai
EXPOSE 3000

CMD ["node", "server.js"]
