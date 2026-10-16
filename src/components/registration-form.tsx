'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function RegistrationForm({ returnTo = '/challenge' }: { returnTo?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      const result = await fetch('/api/registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), rollNumber: fields.get('rollNumber'), returnTo }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await result.json();
      if (!result.ok) { setError(data.message || 'Unable to register. Please try again.'); return; }
      router.replace(data.redirectTo || '/challenge'); router.refresh();
    } catch { setError('Unable to confirm registration. Check your connection and reload in this browser before trying again.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={register} className="registration-form">
    <label htmlFor="name">Name</label>
    <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} disabled={pending} />
    <label htmlFor="rollNumber">Roll Number</label>
    <input id="rollNumber" name="rollNumber" autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={2} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9/_\-]{1,49}" disabled={pending} aria-describedby="roll-hint" />
    <small id="roll-hint">Use the roll number issued by your college.</small>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'STARTING…' : 'START CHALLENGE'}</button>
  </form>;
}
