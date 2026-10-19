import Link from 'next/link';
import { MCQ_MIGRATION, QuestionSchemaError } from '@/lib/question-schema';

export default function AdminQuestionUnavailable({error,retry}: {error:unknown;retry:string}) {
  return <main className="admin-editor"><h1>Question editor unavailable</h1>
    {error instanceof QuestionSchemaError ? <><p>The connected Supabase database has not received the MCQ update yet.</p>
      <ol><li>Open your Supabase project → SQL Editor.</li><li>Run the contents of <code>supabase/migrations/{MCQ_MIGRATION}</code>.</li><li>Reload this page.</li></ol>
      <p>Use this upgrade migration, not the fresh database setup file. Existing scores and submissions are preserved.</p></> : <p>Unable to reach the question database. Please try again.</p>}
    <div className="admin-nav"><Link href={retry}>Try again</Link><Link href="/admin">Back to admin</Link></div>
  </main>;
}
