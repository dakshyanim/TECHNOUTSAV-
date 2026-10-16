import { requireAdminPage } from '@/lib/admin-auth';
import AdminQuestionForm from '@/components/admin-question-form';
export const dynamic='force-dynamic';
export default async function NewQuestion() {
  await requireAdminPage();
  return <main className="admin-editor"><h1>Add question</h1><AdminQuestionForm /></main>;
}
