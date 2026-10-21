import { createDatabaseClient } from '@/lib/supabase/admin';

import { ALREADY_ATTEMPTED } from '@/lib/challenge-messages';
export const isChallengeCode = (code: string) => /^[A-Z0-9-]{1,40}$/.test(code);
interface LiveQuestion {id:string;challenge_code:string;question:string;choices:string[];points:number;active:boolean;claimed_at:string|null}

export class ChallengeError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export async function getChallenge(code: string, participantId: string) {
  if (!isChallengeCode(code)) throw new ChallengeError(404, 'NOT_FOUND', 'Challenge not found.');
  const client = createDatabaseClient();
  const { data: question, error } = await client.rpc('get_live_question',{p_code:code}).returns<LiveQuestion[]>().maybeSingle();
  if (error?.code==='P0101') throw new ChallengeError(423,'CHALLENGE_CLOSED','The challenge is not live. Wait for the organizer to start it, or the time has ended.');
  if (error) throw new ChallengeError(503, 'UNAVAILABLE', 'Challenge is temporarily unavailable.');
  if (!question) throw new ChallengeError(404, 'NOT_FOUND', 'Challenge not found.');
  if (!question.active && !question.claimed_at) throw new ChallengeError(410, 'INACTIVE', 'This challenge is not active.');
  const { data: attempt, error: attemptError } = await client.from('submissions')
    .select('id,submitted_at').eq('participant_id', participantId).eq('question_id', question.id).maybeSingle();
  if (attemptError) throw new ChallengeError(503, 'UNAVAILABLE', 'Challenge is temporarily unavailable.');
  if (question.claimed_at && !attempt) throw new ChallengeError(410, 'EXPIRED', 'This challenge has expired. Another participant answered correctly.');
  if (!Array.isArray(question.choices) || question.choices.length!==4) throw new ChallengeError(410, 'INACTIVE', 'This question is not ready.');
  return { question, alreadyAttempted: Boolean(attempt) };
}

export async function recordChallengeAnswer(code: string, participantId: string, answer: string) {
  const { question, alreadyAttempted } = await getChallenge(code, participantId);
  if (alreadyAttempted) throw new ChallengeError(409, 'ALREADY_ATTEMPTED', ALREADY_ATTEMPTED);
  const { data, error } = await createDatabaseClient().rpc('submit_answer', {
    p_participant_id: participantId, p_question_id: question.id, p_answer: answer,
  }).single();
  if (error) {
    if (error.code === 'P0101') throw new ChallengeError(423, 'CHALLENGE_CLOSED', 'The challenge is not live. Wait for the organizer to start it, or the time has ended.');
    if (error.code === '23505') throw new ChallengeError(409, 'ALREADY_ATTEMPTED', ALREADY_ATTEMPTED);
    if (error.code === 'P0001') throw new ChallengeError(410, 'EXPIRED', 'This challenge has expired. Another participant answered correctly.');
    if (error.code === '22023') throw new ChallengeError(400, 'INVALID_CHOICE', 'Select one of the four choices.');
    if (error.code === '55000') throw new ChallengeError(410, 'INACTIVE', 'This challenge is not active.');
    if (error.code === '23503') throw new ChallengeError(404, 'NOT_FOUND', 'Challenge not found.');
    throw new ChallengeError(503, 'UNAVAILABLE', 'Unable to save your answer. Please try again.');
  }
  const row = data as unknown as { submission_id: string; is_correct: boolean | null; points_awarded: number; total_score: number };
  return {
    submissionId: row.submission_id, challengeCode: code,
    status: row.is_correct === null ? 'pending' : 'graded',
    isCorrect: row.is_correct, pointsAwarded: row.points_awarded, totalScore: row.total_score,
  };
}
