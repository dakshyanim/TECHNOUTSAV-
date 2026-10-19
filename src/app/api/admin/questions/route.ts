import { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { authorizeAdmin,readAdminJson,adminError,adminJson,AdminHttpError } from '@/lib/admin-http';
import { validateQuestion } from '@/lib/admin-question';
import { isMissingQuestionSchema, QuestionSchemaError } from '@/lib/question-schema';

export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request);
    const input=validateQuestion(await readAdminJson(request));
    if (!input) throw new AdminHttpError(400,'Enter a question, four distinct choices, a correct choice and whole-number points from 0 to 10,000.');
    const {data,error}=await createDatabaseClient().from('questions').insert(input).select('id,challenge_code').single();
    if (isMissingQuestionSchema(error)) throw new QuestionSchemaError();
    if (error) throw new Error('Question creation failed.');
    return adminJson({question:data},201);
  } catch(error) { return adminError(error); }
}
