import Link from 'next/link';
import { redirect } from 'next/navigation';
import { adminConfig,isAdmin } from '@/lib/admin-auth';
import AdminLoginForm from '@/components/admin-login-form';

export const dynamic='force-dynamic';
export default async function AdminLogin() {
  if (await isAdmin()) redirect('/admin');
  return <main className="registration-shell"><p className="eyebrow">TECHNO UTSAV</p><h1>Admin login</h1>
    <section>{adminConfig()?<AdminLoginForm />:<p>Administrator authentication is not configured. Set the server-only admin password hash and session secret.</p>}</section>
    <Link href="/">Return to the event</Link>
  </main>;
}
