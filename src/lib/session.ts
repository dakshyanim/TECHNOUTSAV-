import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createDatabaseClient } from '@/lib/supabase/admin';

export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-techno-session' : 'techno-session';
export const SESSION_SECONDS = 24 * 60 * 60;

export function newSessionToken() { return randomBytes(32).toString('hex'); }
export function hashSessionToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

export async function getParticipantSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const client = createDatabaseClient();
  const { data: session, error } = await client.from('participant_sessions')
    .select('participant_id').eq('token_hash', hashSessionToken(token))
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new Error('Session lookup failed.');
  if (!session) return null;
  const { data, error: participantError } = await client.from('participants')
    .select('id,name,roll_number,total_score').eq('id', session.participant_id).maybeSingle();
  if (participantError) throw new Error('Participant lookup failed.');
  return data;
}
