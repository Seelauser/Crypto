FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.12.0

# Dependencies
FROM base AS deps
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma generation
RUN cd packages/db && pnpm prisma generate

# Next.js build
RUN pnpm build

# Production image
FROM base AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["pnpm", "start"]