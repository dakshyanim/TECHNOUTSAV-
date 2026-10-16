import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminQrQuestions,qrOrigin } from '@/lib/admin-qr';
import { isQuestionId } from '@/lib/admin-question';
import AdminQrCard from '@/components/admin-qr-card';
import AdminQrPrint from '@/components/admin-qr-print';

export const dynamic='force-dynamic';
export default async function SingleQr({params}:{params:Promise<{id:string}>}) {
  await requireAdminPage();
  const {id}=await params; if (!isQuestionId(id)) notFound();
  const [question]=await getAdminQrQuestions(id); if (!question) notFound();
  return <main className="qr-management qr-single">
    <header className="qr-no-print"><h1>Print question QR</h1><div className="admin-nav"><Link href="/admin/qr">All active QR codes</Link><AdminQrPrint /></div></header>
    <AdminQrCard question={question} origin={qrOrigin()} />
  </main>;
}
