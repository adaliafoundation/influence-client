# syntax=docker/dockerfile:1

FROM node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284 AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY patches ./patches
RUN npm ci --include=dev

FROM dependencies AS test
ENV CI=true
COPY . .
CMD ["npm", "test", "--", "--watchAll=false"]

FROM dependencies AS browser-test
RUN npx playwright install --with-deps chromium
ENV CI=true
COPY . .
CMD ["npm", "test", "--", "--watchAll=false"]

FROM dependencies AS build
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false
COPY . .
RUN npm run test:runtime-config && npm run build

FROM node:22-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284 AS production
WORKDIR /app
ENV NODE_ENV=production
ENV REQUIRE_RUNTIME_CONFIG=true
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
ARG IMAGE_REVISION=local
ENV IMAGE_REVISION=$IMAGE_REVISION
COPY --from=build /app/build ./build
COPY --from=build /app/server.built.js ./server.built.js
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r => { if (r.status !== 204) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "server.built.js"]
