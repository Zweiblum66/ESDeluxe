# Stage 1: Build Vue app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY client/package.json client/

# Install dependencies
RUN npm install --workspace=client --workspace=shared

# Copy source
COPY shared/ shared/
COPY client/ client/
COPY tsconfig.base.json ./

# Build
WORKDIR /app/client
RUN npx vite build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS runtime

# Copy built assets
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy nginx config
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
