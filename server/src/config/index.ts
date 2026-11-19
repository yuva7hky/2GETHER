import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Resolve directory safely across both CommonJS and ESM environments
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Helper function to safely populate environment variables from an env file
function loadEnvFromFile(filePath: string, allowOverrideEmpty: boolean = true) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = dotenv.parse(content);
    for (const [key, value] of Object.entries(parsed)) {
      const trimmedVal = value ? value.trim().replace(/^['"]|['"]$/g, '') : '';
      const existingVal = process.env[key] ? process.env[key]!.trim().replace(/^['"]|['"]$/g, '') : '';

      // Set if not defined in process.env, or if existing value is empty string/placeholder and file has real value
      const isExistingPlaceholder = !existingVal || existingVal.includes('your-') || existingVal.includes('placeholder');
      const isFileNonPlaceholder = trimmedVal.length > 0 && !trimmedVal.includes('your-') && !trimmedVal.includes('placeholder');

      if ((!existingVal || (allowOverrideEmpty && isExistingPlaceholder)) && isFileNonPlaceholder) {
        process.env[key] = trimmedVal;
      } else if (!process.env[key] && trimmedVal.length > 0) {
        process.env[key] = trimmedVal;
      }
    }
  } catch {
    // Continue cleanly if file cannot be read
  }
}

// Candidate paths for real .env configuration (NEVER load from .env.example)
const envCandidatePaths = [
  path.resolve(currentDir, '../../.env'), // Reliable path from server/src/config or server/dist/config
  path.resolve(process.cwd(), 'server', '.env'), // Reliable path when running from workspace root
  path.resolve(process.cwd(), '.env'), // Path when running directly inside server directory
  path.resolve(currentDir, '../../.env.local'),
  path.resolve(process.cwd(), 'server', '.env.local'),
  path.resolve(process.cwd(), '.env.local'),
];

for (const p of envCandidatePaths) {
  loadEnvFromFile(p, true);
}

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_URL: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_KEY: z.string().optional(),
  SERVICE_ROLE_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('2gether-movies'),
  R2_PUBLIC_DOMAIN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

// Extract and sanitize URL and Secret Key (supports both legacy JWT and new sb_secret_ formats)
const rawUrl =
  parsedEnv.data.SUPABASE_URL ||
  parsedEnv.data.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

const rawSecretKey =
  parsedEnv.data.SUPABASE_SECRET_KEY ||
  parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY ||
  parsedEnv.data.SUPABASE_SERVICE_KEY ||
  parsedEnv.data.SUPABASE_KEY ||
  parsedEnv.data.SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

const supabaseUrl = rawUrl.trim().replace(/^['"]|['"]$/g, '');
const supabaseSecretKey = rawSecretKey.trim().replace(/^['"]|['"]$/g, '');

// Ensure process.env is synced with sanitized values
if (supabaseUrl) process.env.SUPABASE_URL = supabaseUrl;
if (supabaseSecretKey) process.env.SUPABASE_SECRET_KEY = supabaseSecretKey;

// Check if credentials are real and not dummy placeholders
// Accepts standard Supabase URLs (https://*.supabase.co) and keys (sb_secret_*, eyJ*)
const hasValidSupabase = Boolean(
  supabaseUrl &&
  supabaseSecretKey &&
  supabaseUrl.length > 0 &&
  supabaseSecretKey.length > 0 &&
  !supabaseUrl.includes('your-project') &&
  !supabaseSecretKey.includes('your-supabase') &&
  !supabaseSecretKey.includes('your-service') &&
  (supabaseSecretKey.startsWith('sb_secret_') ||
   supabaseSecretKey.startsWith('ey') ||
   supabaseSecretKey.length >= 20)
);

// Sanitize Cloudflare R2 credentials
const r2AccountId = (parsedEnv.data.R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '').trim().replace(/^['"]|['"]$/g, '');
const r2AccessKeyId = (parsedEnv.data.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '').trim().replace(/^['"]|['"]$/g, '');
const r2SecretAccessKey = (parsedEnv.data.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const r2BucketName = (parsedEnv.data.R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || '2gether-movies').trim().replace(/^['"]|['"]$/g, '');

const hasValidR2 = Boolean(
  r2AccountId &&
  r2AccessKeyId &&
  r2SecretAccessKey &&
  !r2AccountId.includes('your-') &&
  !r2AccessKeyId.includes('your-') &&
  !r2SecretAccessKey.includes('your-')
);

export const config = {
  ...parsedEnv.data,
  SUPABASE_URL: supabaseUrl || undefined,
  SUPABASE_SECRET_KEY: supabaseSecretKey || undefined,
  R2_ACCOUNT_ID: r2AccountId || undefined,
  R2_ACCESS_KEY_ID: r2AccessKeyId || undefined,
  R2_SECRET_ACCESS_KEY: r2SecretAccessKey || undefined,
  R2_BUCKET_NAME: r2BucketName,
  R2_ENDPOINT: r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : undefined,
  isDev: parsedEnv.data.NODE_ENV === 'development',
  hasSupabase: hasValidSupabase,
  hasR2: hasValidR2,
};
