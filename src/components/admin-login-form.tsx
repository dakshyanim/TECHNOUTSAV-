'use client';
import { useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginForm() {
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const router=useRouter();
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const password=new FormData(event.currentTarget).get('password');
    setPending(true); setError('');
    try {
      const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const data=await response.json();
      if (!response.ok) { setError(data.message || 'Unable to log in.'); return; }
      router.replace('/admin'); router.refresh();
    } catch { setError('Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={login} className="registration-form">
    <label htmlFor="admin-password">Administrator password</label>
    <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={pending} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button disabled={pending}>{pending?'LOGGING IN…':'LOG IN'}</button>
  </form>;
}
