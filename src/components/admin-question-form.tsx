'use client';
import { useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AdminQuestion } from '@/lib/admin-question';

export default function AdminQuestionForm({question}: {question?:AdminQuestion}) {
  const [pending,setPending]=useState(false),[error,setError]=useState(''); const router=useRouter();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const fields=new FormData(event.currentTarget);
    const payload={question:fields.get('question'),category:fields.get('category'),difficulty:fields.get('difficulty'),correct_answer:fields.get('correct_answer'),points:Number(fields.get('points')),active:fields.get('active')==='on'};
    setPending(true); setError('');
    try {
      const response=await fetch(question?`/api/admin/questions/${question.id}`:'/api/admin/questions',{
        method:question?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
      });
      const data=await response.json();
      if (!response.ok) { setError(data.message || 'Unable to save question.'); return; }
      router.push('/admin?notice=saved'); router.refresh();
    } catch { setError('Unable to save question. Please try again.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={save} className="registration-form admin-question-form">
    {question && <p>QR code: {question.challenge_code}</p>}
    <label htmlFor="question-text">Question text</label><textarea id="question-text" name="question" required maxLength={4000} rows={4} defaultValue={question?.question} disabled={pending} />
    <label htmlFor="category">Category</label><input id="category" name="category" required maxLength={100} defaultValue={question?.category} disabled={pending} />
    <label htmlFor="difficulty">Difficulty</label><select id="difficulty" name="difficulty" defaultValue={question?.difficulty || 'easy'} disabled={pending}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
    <label htmlFor="correct-answer">Correct answer</label><textarea id="correct-answer" name="correct_answer" required maxLength={1000} rows={2} defaultValue={question?.correct_answer} disabled={pending} />
    <label htmlFor="points">Points</label><input id="points" name="points" type="number" required min={0} max={10000} step={1} defaultValue={question?.points ?? 10} disabled={pending} />
    <label className="admin-checkbox"><input name="active" type="checkbox" defaultChecked={question?.active ?? true} disabled={pending} /> Active</label>
    {question && <p>Changes apply to future submissions. Existing scores remain unchanged.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button disabled={pending}>{pending?'Saving…':'Save question'}</button><Link href="/admin">Cancel</Link>
  </form>;
}
