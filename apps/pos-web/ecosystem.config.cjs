// PM2 ecosystem config for the POS Web (Vite SPA).
// Usage (from this folder):
//   pnpm --filter @erp/pos-web build
//   pm2 start ecosystem.config.cjs --env production
//
// Same notes as backoffice-web: this serves the built `dist/` with `vite
// preview`. Put a reverse proxy in front for production traffic.

const path = require('node:path');

const PORT = process.env.POS_PORT || '3001';
const HOST = process.env.POS_HOST || '0.0.0.0';

module.exports = {
  apps: [
    {
      name: 'erp-pos-web',
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
