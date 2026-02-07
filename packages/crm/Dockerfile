# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY admin/package.json ./admin/

# Install all dependencies (including dev)
RUN pnpm install

# Copy source files
COPY . .

# Build admin UI and backend
RUN pnpm run build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod

# Copy built backend and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
