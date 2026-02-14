import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { initEsApiClient, getEsApiClient } from './services/editshare-api/client.js';
import { initLdapClient, getLdapClient } from './services/ldap/client.js';
import { listUsers } from './services/editshare-api/users.service.js';
import { startScheduler, stopScheduler } from './services/tiering-scheduler.service.js';
import { startTrashScheduler, stopTrashScheduler } from './services/trash/trash-scheduler.service.js';
import { remountAllSmbLocations, unmountAllSmbLocations } from './services/archive/smb-mount.service.js';
import { startAssetScanScheduler, stopAssetScanScheduler } from './services/asset-catalog/scan-scheduler.service.js';
import { checkFfprobeAvailable, checkExiftoolAvailable } from './services/asset-catalog/metadata.service.js';
import { startQosScheduler, stopQosScheduler } from './services/qos-scheduler.service.js';
import { startGuardianReceiver, stopGuardianReceiver } from './services/guardian-receiver.service.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  logger.info('========================================');
  logger.info(' EditShare Manager - Starting up');
  logger.info('========================================');

  // --- Initialize Database ---
  logger.info('Initializing database...');
  try {
    initDatabase();
    logger.info('Database initialized successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize database');
    process.exit(1);
  }

  // --- Initialize EditShare API Client ---
  logger.info({ host: config.ES_HOST, port: config.ES_API_PORT }, 'Initializing ES API client...');
  try {
    initEsApiClient({
      host: config.ES_HOST,
      port: config.ES_API_PORT,
      username: config.ES_API_USER,
      password: config.ES_API_PASSWORD,
      allowSelfSigned: config.ES_ALLOW_SELF_SIGNED,
    });
    logger.info('ES API client initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize ES API client');
    process.exit(1);
  }

  // --- Validate ES API Connection ---
  logger.info('Validating ES API connection...');
  try {
    const client = getEsApiClient();
    await client.get('/api/v1/storage/auth', { timeout: 10_000 });
    logger.info('ES API connection validated successfully');
  } catch (err) {
    logger.warn({ err }, 'ES API connection validation failed - server will start but ES API may be unreachable');
  }

  // --- Initialize LDAP Client ---
  logger.info({ uri: config.LDAP_URI }, 'Initializing LDAP client...');
  try {
    await initLdapClient({
      uri: config.LDAP_URI,
      bindDn: config.LDAP_BIND_DN,
      bindPassword: config.LDAP_BIND_PASSWORD,
      rejectUnauthorized: config.LDAP_REJECT_UNAUTHORIZED,
    });
    logger.info('LDAP client initialized and bound');
  } catch (err) {
    logger.warn({ err }, 'LDAP connection failed - server will start but LDAP features will be unavailable');
  }

  // --- Remount SMB Archive Locations ---
  logger.info('Remounting SMB archive locations...');
  try {
    await remountAllSmbLocations();
  } catch (err) {
    logger.warn({ err }, 'Some SMB archive locations failed to remount');
  }

  // --- Check Asset Catalog Tool Availability ---
  await Promise.all([
    checkFfprobeAvailable(),
    checkExiftoolAvailable(),
  ]);

  // --- Start Express Server ---
  const app = createApp();

  const server = app.listen(config.APP_PORT, () => {
    logger.info('========================================');
    logger.info(` Server listening on port ${config.APP_PORT}`);
    logger.info(` ES API: https://${config.ES_HOST}:${config.ES_API_PORT}`);
    logger.info(` LDAP: ${config.LDAP_URI}`);
    logger.info(` EFS mount: ${config.EFS_MOUNT_POINT}`);

    try {
      const ldap = getLdapClient();
      logger.info(` LDAP connected: ${ldap.isConnected()}`);
    } catch {
      logger.info(' LDAP connected: false');
    }

    logger.info('========================================');

    // --- Start Tiering Scheduler ---
    startScheduler();

    // --- Start Trash Purge Scheduler ---
    startTrashScheduler();

    // --- Start Asset Catalog Scan Scheduler ---
    startAssetScanScheduler();

    // --- Start QoS History & Scheduling Scheduler ---
    startQosScheduler();

    // --- Start Guardian Log Receiver ---
    startGuardianReceiver();

    // --- Warm up user list cache in background ---
    listUsers()
      .then((users) => logger.info({ count: users.length }, 'User list cache warmed up'))
      .catch((err) => logger.warn({ err }, 'User list cache warm-up failed'));
  });

  // --- Graceful Shutdown ---
  const shutdown = (signal: string) => {
    logger.info({ signal }, `Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      stopScheduler();
      stopTrashScheduler();
      stopAssetScanScheduler();
      stopQosScheduler();
      stopGuardianReceiver();

      // Unmount SMB archive shares
      try {
        await unmountAllSmbLocations();
      } catch {
        // Best effort — don't block shutdown
      }

      try {
        const ldap = getLdapClient();
        ldap.disconnect();
      } catch {
        // LDAP may not have been initialized
      }

      closeDatabase();

      logger.info('All connections closed. Goodbye!');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled startup error');
  process.exit(1);
});
