# Container image for the standalone multiplayer server.
# Deploy this to any host (Render, Railway, Fly.io, a VPS, …).
#
# The server's only durable state is a SQLite file (accounts, friends,
# records). Cloud hosts have EPHEMERAL filesystems — that file is wiped on
# every redeploy — so we bundle Litestream, which continuously streams the
# database to object storage (e.g. Cloudflare R2) and restores it on boot.
# The application code is unchanged: it still uses a local synchronous SQLite
# file at $DATA_DIR/gamehub.db.
FROM node:22-slim

WORKDIR /app

# CA certificates — the slim base image ships without them, and Litestream (a
# Go binary) needs the system CA store to verify the object-storage TLS cert.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Litestream (single static binary).
ARG LITESTREAM_VERSION=0.3.13
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz && rm /tmp/litestream.tar.gz

# Install dependencies (tsx runs the TypeScript server directly).
# better-sqlite3 downloads a prebuilt binary, so no compiler is needed.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the source the server needs.
COPY tsconfig*.json ./
COPY server ./server
COPY shared ./shared
COPY litestream.yml /etc/litestream.yml

# The platform provides PORT; the server reads it (see server/src/config.ts).
ENV NODE_ENV=production
# Where the SQLite file lives (must match the path in litestream.yml).
ENV DATA_DIR=/data
EXPOSE 3001

# On boot: restore the latest snapshot from object storage if the replica
# exists (no-op on the very first deploy), then run the server UNDER
# Litestream so every write is replicated and a final sync happens on
# SIGTERM (redeploy/shutdown).
CMD ["sh", "-c", "litestream restore -if-replica-exists /data/gamehub.db && exec litestream replicate -exec 'npm run start:server'"]
