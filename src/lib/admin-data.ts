import { requireAdminPage } from '@/lib/admin-auth';
import { createDatabaseClient } from '@/lib/supabase/admin';
import type { AdminQuestion } from '@/lib/admin-question';
import { isMissingQuestionSchema, QuestionSchemaError } from '@/lib/question-schema';

export interface AdminDashboard {
  participantCount:number; questionCount:number; submissionCount:number;
  questions: Omit<AdminQuestion,'correct_answer'>[];
  participants: {id:string;name:string;roll_number:string;total_score:number;created_at:string}[];
  submissions: {id:string;participant_name:string;roll_number:string;challenge_code:string;submitted_answer:string;is_correct:boolean|null;points_awarded:number;submitted_at:string}[];
  leaderboard: {rank:number;participant_id:string;name:string;total_score:number}[];
}
export async function getAdminDashboard(page: number) {
  await requireAdminPage();
  const {data,error}=await createDatabaseClient().rpc('admin_get_dashboard',{p_page:page}).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error('Unable to load admin dashboard.');
  return data as unknown as AdminDashboard;
}
export async function getAdminQuestion(id: string) {
  await requireAdminPage();
  const {data,error}=await createDatabaseClient().from('questions')
    .select('id,challenge_code,question,choices,correct_answer,points,active,claimed_at').eq('id',id).maybeSingle();
  if (isMissingQuestionSchema(error)) throw new QuestionSchemaError();
  if (error) throw new Error('Unable to load question.');
  return data as AdminQuestion|null;
}
export async function requireAdminQuestionSchema() {
  await requireAdminPage();
  const {error}=await createDatabaseClient().from('questions').select('choices,claimed_at').limit(1);
  if (isMissingQuestionSchema(error)) throw new QuestionSchemaError();
  if (error) throw new Error('Unable to reach question database.');
}
