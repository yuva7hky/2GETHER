import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const hasClientSupabase = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-supabase')
);

export const supabase: SupabaseClient | null = hasClientSupabase
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

if (!hasClientSupabase) {
  console.log('[SupabaseClient] Running without live client Supabase credentials. Local mode active.');
}
