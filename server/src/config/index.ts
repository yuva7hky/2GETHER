import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
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

export const config = {
  ...parsedEnv.data,
  isDev: parsedEnv.data.NODE_ENV === 'development',
  hasSupabase: Boolean(parsedEnv.data.SUPABASE_URL && parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY),
  hasR2: Boolean(
    parsedEnv.data.R2_ACCOUNT_ID &&
    parsedEnv.data.R2_ACCESS_KEY_ID &&
    parsedEnv.data.R2_SECRET_ACCESS_KEY
  ),
};
