import { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { authorizeAdmin,readAdminJson,adminError,adminJson,AdminHttpError } from '@/lib/admin-http';
import { isQuestionId } from '@/lib/admin-question';

export async function POST(request: NextRequest,{params}: {params: Promise<{id:string}>}) {
  try {
    await authorizeAdmin(request);
    const {id}=await params;
    if (!isQuestionId(id)) throw new AdminHttpError(404,'Question not found.');
    const input=await readAdminJson(request);
    const active=input && typeof input==='object' ? (input as Record<string,unknown>).active : undefined;
    if (typeof active!=='boolean') throw new AdminHttpError(400,'Supply an active status.');
    const {data,error}=await createDatabaseClient().from('questions').update({active}).eq('id',id).select('id').maybeSingle();
    if (error) throw new Error('Question activation failed.');
    if (!data) throw new AdminHttpError(404,'Question not found.');
    return adminJson({active});
  } catch(error) { return adminError(error); }
}
