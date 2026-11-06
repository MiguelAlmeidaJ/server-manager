FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @servermap/web --no-frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @servermap/web build

FROM node:22-alpine
RUN npm install -g pm2@6
WORKDIR /app/apps/web
COPY --from=builder /app/apps/web/dist ./dist
COPY apps/web/server.mjs ./server.mjs
EXPOSE 8080
CMD ["pm2-runtime", "start", "server.mjs", "--name", "servermap-web"]
