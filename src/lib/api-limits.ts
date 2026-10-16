import { createDatabaseClient } from '@/lib/supabase/admin';

export async function claimApiRequest(scope: 'registration' | 'submission', key: string) {
  const { data, error } = await createDatabaseClient().rpc('claim_api_request', { p_scope: scope, p_key: key });
  if (error) throw new Error('Request limiter unavailable.');
  return data === true;
}
