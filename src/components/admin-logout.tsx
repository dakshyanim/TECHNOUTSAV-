'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogout() {
  const [pending,setPending]=useState(false),[error,setError]=useState(''); const router=useRouter();
  async function logout() {
    setPending(true); setError('');
    try {
      const response=await fetch('/api/admin/logout',{method:'POST'});
      if (!response.ok) throw new Error('Logout failed');
      router.replace('/admin/login'); router.refresh();
    } catch { setError('Unable to log out. Please try again.'); }
    finally { setPending(false); }
  }
  return <div><button onClick={logout} disabled={pending}>{pending?'Logging out…':'Log out'}</button>{error && <p role="alert">{error}</p>}</div>;
}
