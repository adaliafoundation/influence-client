# syntax=docker/dockerfile:1

########################################
# Base dependencies stage
########################################
FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
COPY .nvmrc ./
COPY .babelrc ./
COPY .slug-post-clean ./

# Copy patches
COPY patches ./patches

RUN npm ci

########################################
# Development stage
########################################
FROM base AS development

ENV NODE_ENV=development

# Copy full source
COPY . .

# Copy runtime injection starting scripts
COPY --chmod=755 runtime-injection.sh /usr/local/bin/runtime-injection.sh
COPY --chmod=755 start-dev.sh /usr/local/bin/start-dev.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/start-dev.sh"]

########################################
# Build stage
########################################
FROM base AS builder

ENV NODE_ENV=production

COPY . .

RUN npm run build

########################################
# Production runtime stage
########################################
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built app
COPY --from=builder /app/build ./build
COPY --from=builder /app/server.built.js ./

# Copy runtime injection starting scripts
COPY --chmod=755 runtime-injection.sh /usr/local/bin/runtime-injection.sh
COPY --chmod=755 start-prod.sh /usr/local/bin/start-prod.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/start-prod.sh"]
