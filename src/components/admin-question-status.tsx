'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminQuestionStatus({id,active}: {id:string;active:boolean}) {
  const [pending,setPending]=useState(false),[error,setError]=useState(''); const router=useRouter();
  async function toggle() {
    if (pending) return; setPending(true); setError('');
    try {
      const response=await fetch(`/api/admin/questions/${id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!active})});
      const data=await response.json();
      if (!response.ok) { setError(data.message || 'Unable to change status.'); return; }
      router.refresh();
    } catch { setError('Unable to change status.'); }
    finally { setPending(false); }
  }
  return <><button disabled={pending} onClick={toggle}>{pending?'Saving…':active?'Deactivate':'Activate'}</button>{error && <p role="alert" className="form-error">{error}</p>}</>;
}
