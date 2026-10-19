'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import type {AdminQuestion} from '@/lib/admin-question';
export default function AdminQuestionForm({question}:{question?:AdminQuestion}) {
 const [pending,setPending]=useState(false),[error,setError]=useState(''); const router=useRouter();
 async function save(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); if(pending)return;
  const fields=new FormData(event.currentTarget);
  const payload={question:fields.get('question'),choices:[0,1,2,3].map(i=>fields.get('choice-'+i)),correct_choice:Number(fields.get('correct_choice')),points:Number(fields.get('points')),active:question?.claimed_at?false:(question?.active ?? true)};
  setPending(true);setError('');
  try {
   const response=await fetch(question?'/api/admin/questions/'+question.id:'/api/admin/questions',{method:question?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
   const data=await response.json();if(!response.ok){setError(data.message || 'Unable to save question.');return;}
   router.push('/admin?notice=saved');router.refresh();
  }catch{setError('Unable to save question. Please try again.');}finally{setPending(false);}
 }
 const correct=question?.choices?.findIndex(c=>c===question.correct_answer);
 return <form onSubmit={save} className="registration-form admin-question-form">
  {question && <p>QR code: {question.challenge_code}</p>}
  <label htmlFor="question-text">Question</label><textarea id="question-text" name="question" required maxLength={4000} rows={4} defaultValue={question?.question} disabled={pending}/>
  {[0,1,2,3].map(i=><div className="mcq-admin-choice" key={i}><label htmlFor={'choice-'+i}>Choice {i+1}</label><input id={'choice-'+i} name={'choice-'+i} required maxLength={500} defaultValue={question?.choices?.[i] || ''} disabled={pending}/></div>)}
  <label htmlFor="correct-choice">Correct choice</label><select id="correct-choice" name="correct_choice" required defaultValue={correct!==undefined && correct>=0?correct:''} disabled={pending}><option value="" disabled>Select the correct choice</option>{[0,1,2,3].map(i=><option key={i} value={i}>Choice {i+1}</option>)}</select>
  <label htmlFor="points">Points</label><input id="points" name="points" type="number" required min={0} max={10000} step={1} defaultValue={question?.points ?? 10} disabled={pending}/>
  {question?.claimed_at && <p>This QR has expired. Editing does not reopen it. Create a new question for a new challenge.</p>}
  {question && <p>Existing scores and submissions stay unchanged.</p>}
  {error && <p role="alert" className="form-error">{error}</p>}<button disabled={pending}>{pending?'Saving…':'Save question'}</button><Link href="/admin">Cancel</Link>
 </form>;
}
