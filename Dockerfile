# syntax=docker/dockerfile:1

ARG APP_VERSION=0.0.0

FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
ARG APP_VERSION
# Vide = URLs /api/... sur le même hôte (neurorun.fr ou www via nginx).
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine AS runner
ARG APP_VERSION
LABEL org.opencontainers.image.version="${APP_VERSION}"
COPY --from=builder /app/out /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
