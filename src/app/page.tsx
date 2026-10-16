import { redirect } from 'next/navigation';
import Link from 'next/link';
import RegistrationForm from '@/components/registration-form';
import { getParticipantSession } from '@/lib/session';
import { challengeReturnPath } from '@/lib/return-path';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = challengeReturnPath((await searchParams).next);
  // Keep the form available during setup; registration reports unavailable errors.
  let participant = null;
  try { participant = await getParticipantSession(); } catch { /* Retry through registration. */ }
  if (participant) redirect(returnTo);
  return (
    <main className="registration-shell">
      <p className="eyebrow">TECHNO UTSAV</p>
      <h1>QR Challenge</h1>
      <p>Enter your details to start the challenge.</p>
      <section>
        <RegistrationForm returnTo={returnTo} />
      </section><Link href="/leaderboard">View live leaderboard →</Link>
    </main>
  );
}
