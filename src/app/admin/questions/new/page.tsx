import { requireAdminPage } from '@/lib/admin-auth';
import AdminQuestionForm from '@/components/admin-question-form';
import AdminQuestionUnavailable from '@/components/admin-question-unavailable';
import { requireAdminQuestionSchema } from '@/lib/admin-data';
export const dynamic='force-dynamic';
export default async function NewQuestion() {
  await requireAdminPage();
  try {await requireAdminQuestionSchema();}
  catch(error){return <AdminQuestionUnavailable error={error} retry="/admin/questions/new"/>;}
  return <main className="admin-editor"><h1>Add question</h1><AdminQuestionForm /></main>;
}
