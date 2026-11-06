FROM node:22-alpine
RUN corepack enable && npm install -g pm2@6
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @servermap/api --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @servermap/api build
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["pm2-runtime", "start", "dist/index.js", "--name", "servermap-api"]
