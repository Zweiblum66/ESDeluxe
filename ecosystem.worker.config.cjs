module.exports = {
  apps: [
    {
      name: 'es-worker',
      script: './worker/dist/worker/src/index.js',
      cwd: '/home/jens/es-worker',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/home/jens/es-worker/logs/error.log',
      out_file: '/home/jens/es-worker/logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 30000,
    },
  ],
};
