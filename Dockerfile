# Multi-stage Dockerfile for Eco Green Solar CMS
# Stage 1: Build React Frontend
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install native compilation dependencies for SQLite
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server application and populated SQLite database (with 6,102 customer records)
COPY server/ ./server/

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/client/dist ./client/dist

# Ensure upload directory exists
RUN mkdir -p server/uploads

# Configure environment
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "server/server.js"]
