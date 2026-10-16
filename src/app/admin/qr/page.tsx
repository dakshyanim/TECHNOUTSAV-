import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminQrQuestions,qrOrigin,type QrQuestion } from '@/lib/admin-qr';
import AdminQrCard from '@/components/admin-qr-card';
import AdminQrPrint from '@/components/admin-qr-print';

export const dynamic='force-dynamic';
export default async function QrManagement() {
  await requireAdminPage();
  let questions:QrQuestion[],origin:string;
  try { origin=qrOrigin(); questions=await getAdminQrQuestions(); }
  catch { return <main><h1>Question QR codes</h1><p>Unable to generate QR codes. Check the database connection and set APP_ORIGIN to the event application origin.</p><Link href="/admin">Back to admin</Link></main>; }
  return <main className="qr-management">
    <header className="qr-no-print"><p className="eyebrow">TECHNO UTSAV · ADMIN</p><h1>Question QR codes</h1>
      <p>{questions.length} active questions · QR destination: {origin}</p>
      <p>Use an event URL that students can reach on their phones. Print at 100% scale and keep the white border intact.</p>
      <div className="admin-nav"><Link href="/admin">Back to admin</Link>{questions.length>0 && <AdminQrPrint all />}</div>
    </header>
    {questions.length?<div className="qr-grid">{questions.map(question=><AdminQrCard key={question.id} question={question} origin={origin} />)}</div>:<p>No active questions. Activate or add a question in the admin dashboard.</p>}
  </main>;
}
