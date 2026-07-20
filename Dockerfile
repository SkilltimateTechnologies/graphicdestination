FROM node:26-slim
WORKDIR /app

# Tolerate flaky registry DNS in build environments.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# --- client build (small dep tree, from registry.npmjs.org) ---
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci --no-audit --no-fund
COPY client/ client/
RUN cd client && npm run build

# --- server: ZERO network at build time ---
# Production node_modules are vendored in vendor/server-deps.tar.gz so the
# image build never depends on registry/mirror availability. Fallback to
# npm ci only if the tarball is missing.
COPY server/package.json server/package-lock.json server/
COPY vendor/server-deps.tar.gz vendor/
COPY server/ server/
RUN tar xzf vendor/server-deps.tar.gz -C server/ || (cd server && npm ci --omit=dev --no-audit --no-fund)

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
