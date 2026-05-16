// PM2 ecosystem config for the Backoffice Web (Vite SPA).
// Usage (from this folder):
//   pnpm --filter @erp/backoffice-web build
//   pm2 start ecosystem.config.cjs --env production
//
// We serve the built `dist/` directory with `vite preview`. For a higher-traffic
// deploy, front it with nginx/Caddy and either keep `vite preview` upstream or
// drop PM2 here and have the reverse proxy serve `dist/` directly.

const path = require('node:path');

const PORT = process.env.BACKOFFICE_PORT || '3000';
const HOST = process.env.BACKOFFICE_HOST || '0.0.0.0';

module.exports = {
  apps: [
    {
      name: 'erp-backoffice-web',
      cwd: __dirname,
      script: path.join('node_modules', 'vite', 'bin', 'vite.js'),
      args: `preview --host ${HOST} --port ${PORT} --strictPort`,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
