export interface QuestionInput { question: string; choices: string[]; correct_answer: string; points: number; active: boolean }
export interface AdminQuestion extends QuestionInput { id: string; challenge_code: string; claimed_at?: string | null }
export function validateQuestion(input: unknown): QuestionInput | null {
 if (!input || typeof input!=='object') return null;
 const p=input as Record<string,unknown>;
 if(typeof p.question!=='string' || !Array.isArray(p.choices) || p.choices.length!==4 || !p.choices.every(c=>typeof c==='string')) return null;
 const question=p.question.trim(), choices=(p.choices as string[]).map(c=>c.trim());
 if(!question || question.length>4000 || choices.some(c=>!c || c.length>500 || /[\u0000]/u.test(c)) || question.includes('\u0000') || new Set(choices.map(c=>c.toLowerCase())).size!==4) return null;
 if(!Number.isInteger(p.correct_choice) || (p.correct_choice as number)<0 || (p.correct_choice as number)>3 || !Number.isInteger(p.points) || (p.points as number)<0 || (p.points as number)>10000 || typeof p.active!=='boolean') return null;
 return {question,choices,correct_answer:choices[p.correct_choice as number],points:p.points as number,active:p.active};
}
export function isQuestionId(value: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
