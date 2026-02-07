/**
 * PM2 Ecosystem Configuration
 * Runs on the EditShare server (192.168.178.191)
 *
 * The Express server serves both the API (port 15700)
 * and the frontend static files — no separate nginx needed.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart es-manager
 *   pm2 logs es-manager
 *   pm2 stop es-manager
 */
module.exports = {
  apps: [
    {
      name: 'es-manager',
      // Compiled JS entry point
      // Build output structure: server/dist/server/src/index.js
      script: './server/dist/server/src/index.js',
      cwd: '/home/editshare/es-manager',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',

      // Environment variables (production defaults)
      env: {
        NODE_ENV: 'production',
        APP_PORT: 15700,
      },

      // Logging
      error_file: '/home/editshare/es-manager/logs/error.log',
      out_file: '/home/editshare/es-manager/logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Restart behavior
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 8000,
    },
  ],
};
