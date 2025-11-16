# ---- Build stage ----
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ENV NODE_ENV=development

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

# Solo copiamos lo necesario para instalar deps y compilar
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Compilamos TypeScript -> dist
RUN npm run build

# ---- Runtime stage ----
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    TZ=America/Santiago \
    PORT=8080 \
    SERVICE_NAME=dys-api-fsc \
    ENV=prod

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

# Solo package.json/lock para instalar deps de producción
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copiamos el código compilado desde el builder
COPY --from=builder /app/dist ./dist

# Seguridad básica: usuario no root
RUN useradd -r -u 10001 nodeuser
USER 10001

EXPOSE 8080

CMD ["node", "dist/interfaces/http/server.js"]