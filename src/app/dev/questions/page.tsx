import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createDatabaseClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function DevelopmentQuestions() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { data, error } = await createDatabaseClient().from('questions')
    .select('challenge_code,question').eq('active', true).order('challenge_code');
  if (error) throw new Error('Unable to retrieve development questions.');
  const origin = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
  return <main><p className="eyebrow">DEVELOPMENT</p><h1>Question QR URLs</h1>
    <p>Generate a QR code from each URL below. Set APP_ORIGIN to an address your phone can reach when testing on another device.</p>
    {!data?.length && <p>No active questions. Apply the migrations and seed data.</p>}
    {data?.map(question => <section key={question.challenge_code}>
      <h2>{question.challenge_code}</h2><p>{question.question}</p>
      
      <a className="qr-url" href={`${origin}/challenge/${question.challenge_code}`}>{`${origin}/challenge/${question.challenge_code}`}</a>
      <p><Link href={`/challenge/${question.challenge_code}`}>Open challenge</Link></p>
    </section>)}
  </main>;
}
