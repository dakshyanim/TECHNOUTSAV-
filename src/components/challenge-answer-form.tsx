'use client';

import { useState, type FormEvent } from 'react';
import { ALREADY_ATTEMPTED } from '@/lib/challenge-messages';

export default function ChallengeAnswerForm({ code, attempted }: { code: string; attempted: boolean }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(attempted);
  const [result, setResult] = useState<{ status: string; isCorrect: boolean | null; pointsAwarded: number; totalScore: number } | null>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || done) return;
    const answer = new FormData(event.currentTarget).get('answer');
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/challenges/${encodeURIComponent(code)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (response.status === 409 && data.code === 'ALREADY_ATTEMPTED') { setDone(true); return; }
      if (response.status === 401) {
        window.location.assign(`/?next=${encodeURIComponent(`/challenge/${code}`)}`); return;
      }
      if (!response.ok) { setError(data.message || 'Unable to submit your answer.'); return; }
      setDone(true); setResult(data.result);
    } catch { setError('Unable to confirm submission. Check your connection and reload before trying again.'); }
    finally { setPending(false); }
  }
  if (done) return <div role="status">
    {result && (result.status === 'graded'
      ? <><h3>{result.isCorrect ? 'Correct answer!' : 'Incorrect answer'}</h3><p>Points awarded: {result.pointsAwarded}</p><p>Total score: {result.totalScore}</p></>
      : <p>Your answer was recorded. Grading is pending.</p>)}
    <p>{ALREADY_ATTEMPTED}</p>
  </div>;
  return <form onSubmit={submit} className="registration-form">
    <label htmlFor="answer">Your answer</label>
    <textarea id="answer" name="answer" required maxLength={1000} rows={4} disabled={pending} />
    <small>You can submit only once. Check your answer before submitting.</small>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'SUBMITTING…' : 'SUBMIT ANSWER'}</button>
  </form>;
}
