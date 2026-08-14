FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined at build time, so they must be a build
# arg rather than a runtime env var. Compose passes it from the host .env.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The operate plate lives in public/ and is server-rendered in the control
# room; fail the build rather than shipping a dashboard without it.
RUN test -f public/operate-plate.png
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0

RUN chown -R node:node /app
USER node

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The standalone server does not bundle public/ — copy it explicitly so
# static assets (e.g. operate-plate.png) resolve in production.
COPY --from=build --chown=node:node /app/public ./public

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3000 || exit 1

EXPOSE 3000
CMD ["node", "server.js"]
