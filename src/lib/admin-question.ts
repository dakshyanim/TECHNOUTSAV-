export interface QuestionInput { question: string; category: string; difficulty: 'easy'|'medium'|'hard'; correct_answer: string; points: number; active: boolean }
export interface AdminQuestion extends QuestionInput { id: string; challenge_code: string }
export function validateQuestion(input: unknown): QuestionInput | null {
  if (!input || typeof input!=='object') return null;
  const p=input as Record<string,unknown>;
  if (typeof p.question!=='string' || typeof p.category!=='string' || typeof p.correct_answer!=='string') return null;
  const question=p.question.trim(), category=p.category.trim(), correct_answer=p.correct_answer.trim();
  if (!question || question.length>4000 || !category || category.length>100 || !correct_answer || correct_answer.length>1000) return null;
  if ([question,category,correct_answer].some(value=>value.includes('\u0000'))) return null;
  if (!['easy','medium','hard'].includes(String(p.difficulty)) || !Number.isInteger(p.points) || (p.points as number)<0 || (p.points as number)>10000 || typeof p.active!=='boolean') return null;
  return {question,category,correct_answer,difficulty:p.difficulty as QuestionInput['difficulty'],points:p.points as number,active:p.active};
}
export function isQuestionId(value: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
