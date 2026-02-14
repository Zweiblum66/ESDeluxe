import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { hostname } from 'os';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// Load .env — try multiple locations:
// 1. CWD (when run directly from worker dir)
// 2. CWD/worker/.env (when PM2 cwd is project root)
// 3. Relative to this source file
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'worker', '.env'),
    resolve(__dirname, '..', '..', '..', 'worker', '.env'),
    resolve(__dirname, '..', '..', '.env'),
];
const envPath = candidates.find((p) => existsSync(p));
dotenvConfig({ path: envPath });

const booleanString = z
    .enum(['true', 'false', '1', '0'])
    .transform((val) => val === 'true' || val === '1');

const schema = z.object({
    MANAGER_URL: z.string().url(),
    WORKER_API_KEY: z.string().min(1, 'WORKER_API_KEY is required'),
    WORKER_ID: z.string().default(`worker-${hostname()}`),
    EFS_MOUNT_POINT: z.string().default('/efs/efs_1'),
    CATALOG_DATA_PATH: z.string().default('/efs/efs_1/editshare/catalog'),
    MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
    POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
    HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
    JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
    GUARDIAN_PROCESSING_ENABLED: booleanString.default('true'),
});

export const config = schema.parse(process.env);
