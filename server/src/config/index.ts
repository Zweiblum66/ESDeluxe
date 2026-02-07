import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { envSchema, type EnvConfig } from './schema.js';

// Load .env from project root.
// In development: __dirname = server/src/config → 3 levels up
// In production:  __dirname = server/dist/server/src/config → 5 levels up
// Also try cwd as fallback (PM2 sets cwd to project root)
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '..', '..', '.env'),
  resolve(__dirname, '..', '..', '..', '..', '..', '.env'),
];

const envPath = envCandidates.find((p) => existsSync(p));
if (envPath) {
  dotenvConfig({ path: envPath });
} else {
  console.warn('No .env file found. Using environment variables only.');
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config: Readonly<EnvConfig> = Object.freeze(parsed.data);
