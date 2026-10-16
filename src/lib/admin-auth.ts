import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validAdminConfig, verifyAdminToken } from '@/lib/admin-crypto';
import { createHash } from 'node:crypto';
import { createDatabaseClient } from '@/lib/supabase/admin';

export const adminTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export const ADMIN_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-techno-admin' : 'techno-admin';
export function adminConfig() {
  const hash=process.env.ADMIN_PASSWORD_HASH, secret=process.env.ADMIN_SESSION_SECRET;
  return validAdminConfig(hash,secret) ? {hash:hash!,secret:secret!} : null;
}
export async function isAdmin() {
  const config=adminConfig();
  const token=(await cookies()).get(ADMIN_COOKIE)?.value;
  if (!config || !token || !verifyAdminToken(token,config.hash,config.secret)) return false;
  const { data, error } = await createDatabaseClient().from('revoked_admin_sessions')
    .select('token_hash').eq('token_hash',adminTokenHash(token)).maybeSingle();
  if (error) throw new Error('Admin session verification unavailable.');
  return !data;
}
export async function requireAdminPage() { if (!await isAdmin()) redirect('/admin/login'); }
