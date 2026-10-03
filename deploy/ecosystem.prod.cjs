// PM2 ecosystem shipped at the root of every release tarball (see deploy/package.sh).
//
// The server keeps releases side by side and points a symlink at the live one:
//   <base>/releases/<version>/   <- this file lives here once unpacked
//   <base>/current -> releases/<version>
//
// Node resolves this file through the symlink, so __dirname is the real release
// dir. Every cwd/path below goes through <base>/current instead, which keeps them
// constant across releases: `pm2 reload` then picks up the new code without the
// process definitions changing.

const path = require('node:path');

const current = path.resolve(__dirname, '..', '..', 'current');

// Loads <release>/.env (a link to <base>/shared/.env) into process.env as a side
// effect, so the ports below see it too.
const [api] = require('./apps/api/ecosystem.config.cjs').apps;

function spa(name, app, port) {
  return {
    name,
    cwd: path.join(current, 'apps', app),
    script: 'serve',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '256M',
    time: true,
    env: {
      PM2_SERVE_PATH: path.join(current, 'apps', app, 'dist'),
      PM2_SERVE_PORT: port,
      PM2_SERVE_SPA: 'true',
      PM2_SERVE_HOMEPAGE: '/index.html',
    },
  };
}

module.exports = {
  apps: [
    { ...api, cwd: path.join(current, 'apps', 'api') },
    spa('erp-backoffice-web', 'backoffice-web', process.env.BACKOFFICE_PORT || '3000'),
    spa('erp-pos-web', 'pos-web', process.env.POS_PORT || '3001'),
  ],
};
