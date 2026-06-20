# HospitAI Edge Box Dockerfile
# Multi-stage build: deps → build → runner
# Optimized for Intel NUC (Edge Box) deployment

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts ./
COPY src/ ./src/
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 hospitai && \
    adduser --system --uid 1001 hospitai

# Copy built app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER hospitai
EXPOSE 3000

CMD ["npm", "run", "start"]