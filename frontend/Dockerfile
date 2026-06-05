# --- Etapa 1: build del frontend con Vite ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Etapa 2: servir los estáticos con nginx SIN privilegios ---
#     Corre como el usuario 'nginx' (uid 101), no root, y escucha en 8080
#     (un puerto no privilegiado, requisito para no correr como root).
FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
