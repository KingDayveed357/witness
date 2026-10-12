# One image for every local service (api, worker, web, migrate, seed); compose picks the command.
# Local development only. Render builds natively from render.yaml, not from this file.
FROM node:24-slim
WORKDIR /app
RUN npm install -g pnpm@10.33.0
COPY . .
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false \
 && cd apps/web && NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build
ENV NEXT_TELEMETRY_DISABLED=1
