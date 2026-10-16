import { createDatabaseClient } from '@/lib/supabase/admin';

export class DatabaseError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export async function createParticipant(name: string, rollNumber: string) {
  const { data, error } = await createDatabaseClient().from('participants')
    .insert({ name: name.trim(), roll_number: rollNumber.trim() })
    .select('id,name,roll_number,total_score,created_at').single();
  if (error) throw new DatabaseError(error.code === '23505' ? 'Roll number already registered.' : 'Could not create participant.', error.code);
  return data;
}

export async function getActiveQuestions() {
  const { data, error } = await createDatabaseClient().from('questions')
    .select('id,question,category,difficulty,points,active,created_at')
    .eq('active', true).order('id');
  if (error) throw new DatabaseError('Could not retrieve questions.', error.code);
  return data;
}

// Only trusted backend code may call this after establishing participant identity.
// No public submission endpoint is exposed in this database-only step.
export async function submitAnswer(participantId: string, questionId: string, answer: string) {
  const { data, error } = await createDatabaseClient().rpc('submit_answer', {
    p_participant_id: participantId,
    p_question_id: questionId,
    p_answer: answer,
  }).single();
  if (error) throw new DatabaseError(
    error.code === '23505' ? 'This question has already been answered.' : 'Could not submit answer.', error.code,
  );
  return data;
}
