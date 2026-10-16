import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

// Public credentials respect row-level security. No service-role key is needed.
export function createServerSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase configuration is missing or invalid.');
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
