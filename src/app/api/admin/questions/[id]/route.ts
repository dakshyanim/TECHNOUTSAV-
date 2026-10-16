import { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { authorizeAdmin,readAdminJson,adminError,adminJson,AdminHttpError } from '@/lib/admin-http';
import { validateQuestion,isQuestionId } from '@/lib/admin-question';

export async function PATCH(request: NextRequest,{params}: {params: Promise<{id:string}>}) {
  try {
    await authorizeAdmin(request);
    const {id}=await params;
    if (!isQuestionId(id)) throw new AdminHttpError(404,'Question not found.');
    const input=validateQuestion(await readAdminJson(request));
    if (!input) throw new AdminHttpError(400,'Complete all question fields. Points must be a whole number from 0 to 10,000.');
    const {data,error}=await createDatabaseClient().from('questions').update(input).eq('id',id).select('id,challenge_code').maybeSingle();
    if (error) throw new Error('Question update failed.');
    if (!data) throw new AdminHttpError(404,'Question not found.');
    return adminJson({question:data});
  } catch(error) { return adminError(error); }
}
