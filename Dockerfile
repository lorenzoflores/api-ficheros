# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Etapa 1: dependencias de producción
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# Solo dependencias de producción, exactamente las del lockfile.
# bcrypt trae binarios precompilados para musl: no hace falta compilar nada.
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Etapa 2: imagen final
# ---------------------------------------------------------------------------
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# Carpeta de subidas. Monta aquí un volumen para que los ficheros sobrevivan al contenedor.
RUN mkdir -p /data/uploads && chown node:node /data/uploads

USER node

EXPOSE 3000

# /health comprueba también la conexión a PostgreSQL. Se usa el fetch de Node
# (no curl ni wget) y se lee PORT en tiempo de ejecución por si se cambia.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# node directamente (no npm start) para que el proceso sea el PID 1 y reciba SIGTERM.
CMD ["node", "src/server.js"]
