import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getParticipantSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ChallengePage() {
  const participant = await getParticipantSession();
  if (!participant) redirect('/');
  return <main className="registration-shell">
    <p className="eyebrow">TECHNO UTSAV</p><h1>Welcome, {participant.name}</h1>
    <section><h2>Your challenge</h2><p>Roll number: {participant.roll_number}</p><p>Total score: {participant.total_score}</p>
      <p>Scan a question QR code at the venue to open its challenge. Each question can be attempted once.</p>
    </section><Link href="/leaderboard">View live leaderboard →</Link>
  </main>;
}
