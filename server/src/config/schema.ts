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

  // Application
  APP_PORT: z.coerce.number().int().positive().default(15700),
  APP_SECRET: z.string().min(16, 'APP_SECRET must be at least 16 characters'),
  JWT_EXPIRY: z.string().default('24h'),
});

export type EnvConfig = z.infer<typeof envSchema>;
