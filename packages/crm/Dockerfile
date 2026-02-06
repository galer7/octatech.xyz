# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY admin/package*.json ./admin/

# Install all dependencies (including dev)
RUN npm install

# Copy source files
COPY . .

# Build admin UI and backend
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built backend and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
