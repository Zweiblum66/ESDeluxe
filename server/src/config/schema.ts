import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((val) => val === 'true' || val === '1');

export const envSchema = z.object({
  // EditShare API
  ES_HOST: z.string().min(1, 'ES_HOST is required'),
  ES_API_PORT: z.coerce.number().int().positive().default(8006),
  ES_API_USER: z.string().min(1, 'ES_API_USER is required'),
  ES_API_PASSWORD: z.string().min(1, 'ES_API_PASSWORD is required'),
  ES_ALLOW_SELF_SIGNED: booleanString.default('true'),

  // LDAP
  LDAP_URI: z.string().url('LDAP_URI must be a valid URI'),
  LDAP_BIND_DN: z.string().default(''),
  LDAP_BIND_PASSWORD: z.string().default(''),
  LDAP_BASE_DN: z.string().min(1, 'LDAP_BASE_DN is required'),
  LDAP_REJECT_UNAUTHORIZED: booleanString.default('false'),

  // EFS
  EFS_MOUNT_POINT: z.string().min(1).default('/efs/efs_1'),

  // Tiering
  TIERING_ENABLED: booleanString.default('true'),
  TIERING_CHECK_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  TIERING_MAX_FILES_PER_RUN: z.coerce.number().int().positive().default(1000),
  TIERING_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Archive
  ARCHIVE_ENABLED: booleanString.default('true'),
  ARCHIVE_MAX_CONCURRENT_OPS: z.coerce.number().int().positive().default(5),

  // Trash (EFS snapshot-based soft delete)
  TRASH_ENABLED: booleanString.default('true'),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  TRASH_PURGE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),

  // Asset Catalog
  CATALOG_SCAN_ENABLED: booleanString.default('true'),
  CATALOG_SCAN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  CATALOG_MAX_CHECKSUM_FILES_PER_SCAN: z.coerce.number().int().positive().default(200),
  CATALOG_DATA_PATH: z.string().default('/efs/efs_1/editshare/catalog'),

  // QoS History & Scheduling
  QOS_HISTORY_ENABLED: booleanString.default('true'),
  QOS_HISTORY_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  QOS_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),

  // Guardian Log Receiver (EFS Control / OpenSearch log forwarding)
  GUARDIAN_RECEIVER_ENABLED: booleanString.default('false'),
  GUARDIAN_RECEIVER_PORT: z.coerce.number().int().positive().default(15750),
  GUARDIAN_RECEIVER_PROTOCOL: z.enum(['logstash', 'elasticsearch', 'syslog']).default('elasticsearch'),
  GUARDIAN_RECEIVER_USER: z.string().default('guardian'),
  GUARDIAN_RECEIVER_PASSWORD: z.string().default('guardian15750'),
  GUARDIAN_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  GUARDIAN_WORKER_MODE: z.enum(['local', 'queue']).default('local'),
  GUARDIAN_QUEUE_RETENTION_HOURS: z.coerce.number().int().positive().default(24),

  // Worker API
  WORKER_API_KEY: z.string().default(''),

  // Application
  APP_PORT: z.coerce.number().int().positive().default(15700),
  APP_SECRET: z.string().min(16, 'APP_SECRET must be at least 16 characters'),
  JWT_EXPIRY: z.string().default('24h'),
});

export type EnvConfig = z.infer<typeof envSchema>;
