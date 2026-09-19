# Container image for the standalone multiplayer server.
# Deploy this to any host (Render, Railway, Fly.io, a VPS, …).
FROM node:22-slim

WORKDIR /app

# Install dependencies (tsx runs the TypeScript server directly).
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the source the server needs.
COPY tsconfig*.json ./
COPY server ./server
COPY shared ./shared

# The platform provides PORT; the server reads it (see server/src/config.ts).
ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "run", "start:server"]
