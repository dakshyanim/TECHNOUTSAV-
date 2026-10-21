import Link from 'next/link';
import EventGate from '@/components/event-gate';
import { redirect } from 'next/navigation';
import { getParticipantSession } from '@/lib/session';
import { getChallenge, ChallengeError, isChallengeCode } from '@/lib/challenges';
import ChallengeAnswerForm from '@/components/challenge-answer-form';

export const dynamic = 'force-dynamic';

export default async function Challenge({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isChallengeCode(code)) return <main><h1>Challenge not found</h1><Link href="/challenge">Go back</Link></main>;
  const participant = await getParticipantSession();
  if (!participant) redirect(`/?next=${encodeURIComponent(`/challenge/${code}`)}`);
  let challenge;
  try { challenge = await getChallenge(code, participant.id); }
  catch (error) {
    if (!(error instanceof ChallengeError)) throw error;
    if(error.code==='CHALLENGE_CLOSED')return <main className="registration-shell"><p className="eyebrow">TECHNO UTSAV · {code}</p><EventGate refreshOnOpen><p>Loading your challenge…</p></EventGate><Link href="/challenge">Challenge home</Link></main>;
    return <main className="registration-shell"><p className="eyebrow">TECHNO UTSAV</p><h1>Challenge unavailable</h1><p>{error.message}</p><Link href="/challenge">Go back</Link></main>;
  }
  return <main className="registration-shell">
    <p className="eyebrow">TECHNO UTSAV · {code}</p><h1>QR Challenge</h1>
    <EventGate><p>{challenge.question.points} points · First correct answer wins</p>
    <section><h2>{challenge.question.question}</h2>
      <ChallengeAnswerForm key={code} code={code} attempted={challenge.alreadyAttempted} choices={challenge.question.choices as string[]} />
    </section></EventGate><Link href="/challenge">← Challenge home</Link>
  </main>;
}
