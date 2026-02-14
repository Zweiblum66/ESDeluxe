import { config } from './config.js';
import { logger } from './logger.js';
import { checkFfprobeAvailable, checkExiftoolAvailable } from './metadata.js';
import { checkFfmpegAvailable } from './proxy.js';
import { checkConnection } from './api-client.js';
import { startWorkerLoop, stopWorkerLoop } from './worker-loop.js';
import { access } from 'fs/promises';

async function main(): Promise<void> {
    logger.info('========================================');
    logger.info(' EditShare Manager Worker - Starting up');
    logger.info('========================================');
    logger.info({ workerId: config.WORKER_ID, manager: config.MANAGER_URL }, 'Configuration');

    // --- Check Tool Availability ---
    const [ffprobeOk, exiftoolOk, ffmpegOk] = await Promise.all([
        checkFfprobeAvailable(),
        checkExiftoolAvailable(),
        checkFfmpegAvailable(),
    ]);

    const canDoCatalog = ffprobeOk || ffmpegOk;
    if (!canDoCatalog && !config.GUARDIAN_PROCESSING_ENABLED) {
        logger.error('Neither ffprobe/ffmpeg found nor Guardian processing enabled — worker cannot do useful work. Exiting.');
        process.exit(1);
    }
    if (!canDoCatalog) {
        logger.warn('ffprobe/ffmpeg not found — worker will only process Guardian batches');
    }

    // --- Verify EFS Mount (only required for catalog jobs) ---
    if (canDoCatalog) {
        try {
            await access(config.EFS_MOUNT_POINT);
            logger.info({ path: config.EFS_MOUNT_POINT }, 'EFS mount accessible');
        } catch {
            logger.warn({ path: config.EFS_MOUNT_POINT }, 'EFS mount not accessible — catalog jobs will fail');
        }

        try {
            await access(config.CATALOG_DATA_PATH);
            logger.info({ path: config.CATALOG_DATA_PATH }, 'Catalog data path accessible');
        } catch {
            logger.warn({ path: config.CATALOG_DATA_PATH }, 'Catalog data path not accessible — will be created on first job');
        }
    }

    // --- Verify Manager Connectivity ---
    logger.info({ url: config.MANAGER_URL }, 'Checking manager connectivity...');
    const connected = await checkConnection();
    if (!connected) {
        logger.error({ url: config.MANAGER_URL }, 'Cannot connect to manager — check URL and API key');
        process.exit(1);
    }
    logger.info('Manager connection verified');

    // --- Start Worker Loop ---
    logger.info('========================================');
    logger.info(` Worker ID: ${config.WORKER_ID}`);
    logger.info(` Manager: ${config.MANAGER_URL}`);
    logger.info(` Max concurrent jobs: ${config.MAX_CONCURRENT_JOBS}`);
    logger.info(` ffprobe: ${ffprobeOk ? 'yes' : 'no'}`);
    logger.info(` ffmpeg: ${ffmpegOk ? 'yes' : 'no'}`);
    logger.info(` exiftool: ${exiftoolOk ? 'yes' : 'no'}`);
    logger.info(` Guardian processing: ${config.GUARDIAN_PROCESSING_ENABLED ? 'yes' : 'no'}`);
    logger.info('========================================');

    startWorkerLoop();

    // --- Graceful Shutdown ---
    const shutdown = async (signal: string): Promise<void> => {
        logger.info({ signal }, `Received ${signal}, shutting down gracefully...`);
        await stopWorkerLoop();
        logger.info('Goodbye!');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    logger.fatal({ err }, 'Unhandled startup error');
    process.exit(1);
});
