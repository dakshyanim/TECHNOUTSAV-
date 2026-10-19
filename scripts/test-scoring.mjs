// Creates one permanent TEST participant plus submissions in a configured test DB.
// Run: node --env-file=.env.local scripts/test-scoring.mjs --allow-test-writes
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.argv.includes('--allow-test-writes'), 'Use --allow-test-writes on a test database. This creates persistent fixtures.');
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Missing server Supabase configuration.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const codes = ['Q001','Q002','Q003','Q004','Q005','Q006'];
const { data: rows, error } = await db.from('questions').select('id,challenge_code,correct_answer,choices,points,active').in('challenge_code', codes);
assert.equal(error, null, 'Could not read test questions.');
assert.equal(rows.length, codes.length, 'Apply migrations and seed data first.');
const questions = codes.map(code => rows.find(q => q.challenge_code === code));
assert.ok(questions.every(q => q.active), 'All six test questions must be active.');
const rollNumber = `TEST-${randomUUID()}`;
const registration = await fetch(`${origin}/api/registration`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Scoring Verification', rollNumber }), signal: AbortSignal.timeout(15000),
});
assert.equal(registration.status, 201, 'Registration failed.');
const cookie = registration.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
assert.ok(cookie, 'Missing participant session cookie.');
async function submit(question, answer, extra = {}) {
  const response = await fetch(`${origin}/api/challenges/${question.challenge_code}`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, ...extra }), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
const correct = await submit(questions[0], questions[0].correct_answer, { participant_id: randomUUID(), is_correct: false, points_awarded: 99999 });
assert.equal(correct.status, 201);
assert.equal(correct.body.result.status, 'graded');
assert.equal(correct.body.result.isCorrect, true);
assert.equal(correct.body.result.pointsAwarded, questions[0].points);
assert.equal(correct.body.result.totalScore, questions[0].points);
const wrong = await submit(questions[1], questions[1].choices.find(choice=>choice!==questions[1].correct_answer));
assert.equal(wrong.status, 201);
assert.equal(wrong.body.result.isCorrect, false);
assert.equal(wrong.body.result.pointsAwarded, 0);
assert.equal(wrong.body.result.totalScore, questions[0].points);
const duplicate = await submit(questions[0], questions[0].correct_answer);
assert.equal(duplicate.status, 409);
assert.equal(duplicate.body.code, 'ALREADY_ATTEMPTED');
const raced = await Promise.all([submit(questions[2], questions[2].correct_answer), submit(questions[2], questions[2].correct_answer)]);
assert.deepEqual(raced.map(r => r.status).sort(), [201,409], 'Same-question race must have one winner.');
const distinct = await Promise.all([submit(questions[3], questions[3].correct_answer), submit(questions[4], questions[4].correct_answer)]);
assert.ok(distinct.every(r => r.status === 201), 'Distinct simultaneous answers should both succeed.');
const missing = await submit({ challenge_code: `Q-${randomUUID().replaceAll('-', '').toUpperCase()}` }, 'answer');
assert.equal(missing.status, 404);
const unauthenticated = await fetch(`${origin}/api/challenges/Q001`, { signal: AbortSignal.timeout(15000) });
assert.equal(unauthenticated.status, 401);
const { data: participant, error: participantError } = await db.from('participants').select('id,total_score').eq('roll_number',rollNumber.toUpperCase()).single();
assert.equal(participantError,null);
const expected = questions[0].points + questions[2].points + questions[3].points + questions[4].points;
assert.equal(participant.total_score, expected, 'Concurrent increments lost or duplicated points.');
const { data: attempts, error: attemptsError } = await db.from('submissions').select('question_id,points_awarded').eq('participant_id',participant.id);
assert.equal(attemptsError,null);
assert.equal(attempts.length,5);
assert.equal(new Set(attempts.map(a=>a.question_id)).size,5);
assert.equal(attempts.reduce((sum,a)=>sum+a.points_awarded,0),expected);
// Two different identities compete through independent hosted HTTP/database sessions.
async function anotherParticipant() {
 const response=await fetch(origin+'/api/registration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Global expiry test',rollNumber:'TEST-'+randomUUID()}),signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,201);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
}
const rivals=await Promise.all([anotherParticipant(),anotherParticipant()]);
const globalRace=await Promise.all(rivals.map(rivalCookie=>fetch(origin+'/api/challenges/'+questions[5].challenge_code,{method:'POST',headers:{Origin:origin,Cookie:rivalCookie,'Content-Type':'application/json'},body:JSON.stringify({answer:questions[5].correct_answer}),signal:AbortSignal.timeout(15000)})));
assert.deepEqual(globalRace.map(response=>response.status).sort(),[201,410],'Exactly one participant may win a question.');
const {data:claims,error:claimsError}=await db.from('submissions').select('id').eq('question_id',questions[5].id);
assert.equal(claimsError,null);assert.equal(claims.length,1);
console.log('PASS: different-participant global first-correct race has one success and one expiry.');
console.log('PASS: authenticated correct/wrong answers, duplicates, same/different question concurrency, total score, missing question and client-field tampering.');
console.log('Run supabase/tests/mcq.sql for the current rollback-only MCQ checks.');
console.log('Three TEST participants and six submissions remain in the test database.');
