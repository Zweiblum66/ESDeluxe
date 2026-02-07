# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/

# Install all dependencies (including devDependencies for build)
RUN npm install --workspace=server --workspace=shared

# Copy source
COPY shared/ shared/
COPY server/ server/
COPY tsconfig.base.json ./

# Build TypeScript
WORKDIR /app/server
RUN npx tsc

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/

# Install production dependencies only
RUN npm install --workspace=server --workspace=shared --omit=dev

# Copy built JS from builder
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server/src/db/migrations ./server/dist/db/migrations

# Create data directory
RUN mkdir -p /app/data

EXPOSE 15700

ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
