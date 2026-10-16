import { getSupabaseConfig } from './supabase/config';
import { createServerSupabaseClient } from './supabase/server';

export async function checkHealth() {
  const timestamp = new Date().toISOString();
  if (!getSupabaseConfig()) {
    return { status: 'degraded', app: 'ok', database: 'not_configured', timestamp } as const;
  }
  try {
    const client = createServerSupabaseClient();
    const { error } = await client.rpc('health_check').abortSignal(AbortSignal.timeout(5000));
    if (error) {
      console.error('Database health check failed:', error.code);
      return { status: 'degraded', app: 'ok', database: 'unavailable', timestamp } as const;
    }
    return { status: 'ok', app: 'ok', database: 'ok', timestamp } as const;
  } catch {
    console.error('Database health check failed.');
    return { status: 'degraded', app: 'ok', database: 'unavailable', timestamp } as const;
  }
}
