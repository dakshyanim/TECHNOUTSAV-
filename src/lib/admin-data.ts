import { requireAdminPage } from '@/lib/admin-auth';
import { createDatabaseClient } from '@/lib/supabase/admin';
import type { AdminQuestion } from '@/lib/admin-question';

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
    .select('id,challenge_code,question,category,difficulty,correct_answer,points,active').eq('id',id).maybeSingle();
  if (error) throw new Error('Unable to load question.');
  return data as AdminQuestion|null;
}
