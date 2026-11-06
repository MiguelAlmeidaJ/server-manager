// Host-level PM2 processes: Docker is used for PostgreSQL only.
const { loadEnvFile } = require('node:process');
const path = require('node:path');
const root = __dirname;
loadEnvFile(path.join(root, '.env'));

module.exports = {
  apps: [
    {
      name: 'servermap-api',
      cwd: root,
      script: 'apps/api/dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: process.env.API_PORT || '3333',
        DATABASE_URL: process.env.DATABASE_URL,
        COOKIE_SECURE: process.env.COOKIE_SECURE || 'false',
      },
    },
    {
      name: 'servermap-web',
      cwd: root,
      script: 'apps/web/server.mjs',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: process.env.WEB_PORT || '8080',
        API_ORIGIN: 'http://127.0.0.1:' + (process.env.API_PORT || '3333'),
      },
    },
  ],
};
