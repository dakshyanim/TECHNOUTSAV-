import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// One stateless service client per process; never set a participant auth session.
let databaseClient: SupabaseClient | undefined;

// Server modules only. Never import this module into a client component.
export function createDatabaseClient() {
  if (typeof window !== 'undefined') throw new Error('Server-only database client.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration is missing.');
  return databaseClient ??= createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
