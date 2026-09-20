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
# Note: the 0.5.x release assets are named litestream-<ver>-linux-x86_64.tar.gz
# (no "v" prefix, "x86_64" not "amd64") — different from the 0.3.x naming.
ARG LITESTREAM_VERSION=0.5.16
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz /tmp/litestream.tar.gz
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

# Litestream's S3 client reads the standard AWS credential variable names.
# Render stores our R2 S3 credentials as R2_* variables, so expose them under
# those names before both restore and replication start.
#
# On boot: restore the latest snapshot from object storage if the replica
# exists (no-op on the very first deploy), then run the server UNDER
# Litestream so every write is replicated and a final sync happens on
# SIGTERM (redeploy/shutdown).
CMD ["sh", "-c", "export AWS_ACCESS_KEY_ID=\"${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID must be set}\" AWS_SECRET_ACCESS_KEY=\"${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY must be set}\"; litestream restore -if-replica-exists /data/gamehub.db || echo '[entrypoint] no replica to restore yet (fresh start)'; exec litestream replicate -exec 'npm run start:server'"]
