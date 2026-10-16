import Link from 'next/link';
import type { QrQuestion } from '@/lib/admin-qr';
import { challengeQrUrl } from '@/lib/qr';

export default function AdminQrCard({question,origin}:{question:QrQuestion;origin:string}) {
  const url=challengeQrUrl(origin,question.challenge_code);
  return <article className="qr-card">
    <p className="qr-brand">TECHNO UTSAV · QR CHALLENGE</p>
    <h2>{question.challenge_code}</h2>
    {/* Plain img sends the admin cookie; an image optimizer would not. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="qr-image" src={`/api/admin/qr/${question.id}`} width={320} height={320} alt={`QR code for challenge ${question.challenge_code}`} loading="eager" />
    <p className="qr-scan-instruction">Scan to open this challenge</p>
    <p className="qr-question-text">{question.question}</p>
    <p className="qr-question-id">Question ID: {question.id}</p>
    <a className="qr-challenge-url" href={url}>{url}</a>
    <div className="qr-actions qr-no-print">
      <a href={`/api/admin/qr/${question.id}?format=svg&download=1`}>Download SVG</a>
      <a href={`/api/admin/qr/${question.id}?format=png&download=1`}>Download PNG</a>
      <Link href={`/admin/qr/${question.id}`}>View / print this question</Link>
    </div>
  </article>;
}
