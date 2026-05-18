// Root PM2 ecosystem for the jack-erp monorepo.
// Aggregates the api, backoffice-web, and pos-web app configs so you can start
// the whole stack with a single command:
//
//   pnpm install
//   pnpm build           # builds shared packages + api + both SPAs
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save             # persist process list across reboots
//   pm2 startup          # one-time: install init script (run as root)
//
// Per-app configs live under apps/<name>/ecosystem.config.cjs and can be used
// individually for targeted restarts:
//
//   pm2 start apps/api/ecosystem.config.cjs --env production
//   pm2 restart erp-api

const api = require('./apps/api/ecosystem.config.cjs');
const backoffice = require('./apps/backoffice-web/ecosystem.config.cjs');
const pos = require('./apps/pos-web/ecosystem.config.cjs');

module.exports = {
  apps: [...api.apps, ...backoffice.apps, ...pos.apps],
};
