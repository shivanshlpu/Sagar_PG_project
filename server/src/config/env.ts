import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try multiple candidate paths for .env
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Detect masked bullet characters in keys (e.g. • = \u2022)
const hasMaskedChars = (str: string) => /[\u2022\u25cf\u2219]/.test(str) || str.includes('••••');

const rawAnon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const rawSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: hasMaskedChars(rawAnon) ? '' : rawAnon,
  SUPABASE_SERVICE_ROLE_KEY: hasMaskedChars(rawSecret) ? '' : rawSecret,
  SUPABASE_PUBLISHABLE_KEY: hasMaskedChars(rawAnon) ? '' : rawAnon,
  SUPABASE_SECRET_KEY: hasMaskedChars(rawSecret) ? '' : rawSecret,
  SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'pg-jwt-secret-key-super-secure-2026',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
} as const;

// Warn if secret key is masked
if (hasMaskedChars(rawSecret)) {
  console.warn('\x1b[33m[Supabase Warning] SUPABASE_SECRET_KEY contains masked bullet characters (•). Please reveal the full secret key in your Supabase dashboard and paste it into .env.\x1b[0m');
}

// Validate required env vars at startup
const required: (keyof typeof env)[] = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
];

for (const key of required) {
  if (!env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
