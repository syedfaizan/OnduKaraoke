# Ondu Karaoke — production image.
#
# Builds the React frontend and serves it together with the Express +
# Socket.IO backend from a single container (one port, one URL).
#
#   docker build -t ondu-karaoke .
#   docker run -p 3001:3001 -e YOUTUBE_API_KEY=… ondu-karaoke
#
# Deploy this image to any host that keeps a container alive and supports
# WebSockets (Render, Railway, Fly.io, a VPS…). Vercel cannot host it —
# Vercel Functions cannot hold WebSocket connections.

# ---------- stage 1: build the frontend ----------
FROM node:20-alpine AS client

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- stage 2: runtime ----------
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist

# The platform (Render/Railway/Fly) injects PORT; 3001 is the local default.
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
