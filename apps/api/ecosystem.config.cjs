// PM2 ecosystem config for the ERP API (NestJS).
// Usage (from this folder):
//   pnpm --filter @erp/api build
//   pm2 start ecosystem.config.cjs --env production
//
// Notes:
// - The monorepo root .env is loaded here so PM2 forwards DB/Redis/Kafka/JWT
//   creds to the child process. NestJS ConfigModule only fills missing vars
//   from apps/api/.env(.example), so anything we set here wins.
// - exec_mode is "fork" because the API hosts a Socket.IO server and Kafka
//   consumer groups; switch to "cluster" only after verifying both are
//   safe to run with multiple workers (Redis adapter is already wired up).

const path = require('node:path');

try {
  require('dotenv').config({
    path: path.resolve(__dirname, '..', '..', '.env'),
  });
} catch (_err) {
  // dotenv is optional here — PM2 will still pass through whatever is in
  // the calling shell's environment.
}

module.exports = {
  apps: [
    {
      name: 'erp-api',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '15s',
      kill_timeout: 10000,
      wait_ready: false,
      max_memory_restart: '1G',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '4000',
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASS: process.env.DB_PASS,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        REDIS_DB: process.env.REDIS_DB,
        KAFKA_BROKERS: process.env.KAFKA_BROKERS,
        KAFKA_PORT: process.env.KAFKA_PORT,
        KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
        KAFKA_CONSUMER_GROUP_PREFIX: process.env.KAFKA_CONSUMER_GROUP_PREFIX,
        KAFKA_AUTH_ENABLE: process.env.KAFKA_AUTH_ENABLE,
        KAFKA_SASL_MECHANISM: process.env.KAFKA_SASL_MECHANISM,
        KAFKA_SASL_USERNAME: process.env.KAFKA_SASL_USERNAME,
        KAFKA_SASL_PASSWORD: process.env.KAFKA_SASL_PASSWORD,
        KAFKA_SSL: process.env.KAFKA_SSL,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL,
        JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL,
        POS_VARIANCE_THRESHOLD: process.env.POS_VARIANCE_THRESHOLD,
        ADJUSTMENT_APPROVAL_THRESHOLD: process.env.ADJUSTMENT_APPROVAL_THRESHOLD,
        EXPENSE_APPROVAL_THRESHOLD: process.env.EXPENSE_APPROVAL_THRESHOLD,
        DISABLE_SWAGGER: process.env.DISABLE_SWAGGER || '1',
      },
    },
  ],
};
