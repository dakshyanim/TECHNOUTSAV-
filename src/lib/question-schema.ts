export const MCQ_MIGRATION = '202610190010_mcq_first_correct.sql';
export class QuestionSchemaError extends Error {
  constructor() { super(`Question setup is incomplete. Run ${MCQ_MIGRATION} in Supabase SQL Editor, then reload this page.`); }
}
export function isMissingQuestionSchema(error: {code?: string;message?: string} | null) {
  return Boolean(error && ['42703','PGRST204'].includes(error.code || '') && /\b(choices|claimed_at|claimed_by)\b/i.test(error.message || ''));
}
