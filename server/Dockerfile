# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copia node_modules completo (incluye el cliente de Prisma ya generado en
# la etapa de build) en vez de reinstalar solo dependencias de producción,
# para no tener que volver a correr `prisma generate` sin el CLI de Prisma
# disponible. Es una imagen más simple a costa de ser un poco más grande;
# se puede optimizar después con una tercera etapa que copie selectivamente.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

EXPOSE 4000

# El proceso valida JWT_SECRET/CORS_ORIGIN al arrancar y expone GET /health
# para que el orquestador (Docker/Kubernetes/etc.) verifique que está vivo.
CMD ["node", "dist/index.js"]
