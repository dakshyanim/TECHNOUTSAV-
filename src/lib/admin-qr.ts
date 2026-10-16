import { requireAdminPage } from '@/lib/admin-auth';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { normalizeQrOrigin } from '@/lib/qr';

export interface QrQuestion { id:string;challenge_code:string;question:string;active:boolean }
export function qrOrigin() {
  const value=process.env.APP_ORIGIN || (process.env.NODE_ENV==='production'?'':'http://localhost:3000');
  if (!value) throw new Error('Set APP_ORIGIN to the event application origin before generating QR codes.');
  return normalizeQrOrigin(value);
}
// Never select correct_answer in QR management.
export async function readActiveQrQuestions(id?:string) {
  let query=createDatabaseClient().from('questions').select('id,challenge_code,question,active').eq('active',true);
  if (id) query=query.eq('id',id);
  const {data,error}=await query.order('challenge_code').abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error('Unable to load active QR questions.');
  return data as QrQuestion[];
}
export async function getAdminQrQuestions(id?:string) {
  await requireAdminPage();
  return readActiveQrQuestions(id);
}
