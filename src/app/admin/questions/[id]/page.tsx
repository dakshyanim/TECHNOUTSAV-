import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminQuestion } from '@/lib/admin-data';
import { isQuestionId } from '@/lib/admin-question';
import AdminQuestionForm from '@/components/admin-question-form';
import AdminQuestionUnavailable from '@/components/admin-question-unavailable';
export const dynamic='force-dynamic';
export default async function EditQuestion({params}: {params:Promise<{id:string}>}) {
  await requireAdminPage();
  const {id}=await params; if (!isQuestionId(id)) notFound();
  let question;
  try {question=await getAdminQuestion(id);}
  catch(error){return <AdminQuestionUnavailable error={error} retry={`/admin/questions/${id}`}/>;}
  if (!question) notFound();
  return <main className="admin-editor"><h1>Edit question</h1><AdminQuestionForm question={question} /></main>;
}
