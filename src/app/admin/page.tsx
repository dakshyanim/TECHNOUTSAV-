import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminDashboard,type AdminDashboard } from '@/lib/admin-data';
import AdminLogout from '@/components/admin-logout';
import AdminQuestionStatus from '@/components/admin-question-status';
import { formatUtc } from '@/lib/utc';

export const dynamic='force-dynamic';
export default async function Admin({searchParams}: {searchParams:Promise<{page?:string;notice?:string}>}) {
  await requireAdminPage();
  const params=await searchParams;
  const value=Number(params.page || 1); const page=Number.isInteger(value)&&value>=1&&value<=100000?value:1;
  let data:AdminDashboard;
  try { data=await getAdminDashboard(page); }
  catch { return <main><h1>Admin dashboard</h1><p>Database unavailable. Check the database connection and migration 007.</p><Link href="/admin">Try again</Link><AdminLogout /></main>; }
  const pages=Math.max(1,Math.ceil(data.submissionCount/50));
  return <main className="admin-shell">
    <header className="admin-header"><div><p className="eyebrow">TECHNO UTSAV</p><h1>Admin dashboard</h1></div><AdminLogout /></header>
    {params.notice==='saved' && <p role="status">Question saved.</p>}
    <div className="admin-stats"><div><strong>{data.participantCount}</strong> Total participants</div><div><strong>{data.questionCount}</strong> Total questions</div><div><strong>{data.submissionCount}</strong> Total submissions</div></div>
    <nav className="admin-nav" aria-label="Admin sections"><a href="#questions">Questions</a><a href="#participants">Participants</a><a href="#submissions">Submissions</a><a href="#standings">Leaderboard</a><a href="/api/admin/export">Export results CSV</a></nav>
    <section id="questions"><h2>Questions</h2><div className="admin-nav"><Link href="/admin/questions/new">Add question</Link><Link href="/admin/qr">Generate / print active QR codes</Link></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>QR code</th><th>Question</th><th>Category</th><th>Difficulty</th><th>Points</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{data.questions.map(q=><tr key={q.id}><td><Link href={`/challenge/${q.challenge_code}`}>{q.challenge_code}</Link></td><td>{q.question}</td><td>{q.category}</td><td>{q.difficulty}</td><td>{q.points}</td><td>{q.active?'Active':'Inactive'}</td><td><Link href={`/admin/questions/${q.id}`}>Edit</Link><AdminQuestionStatus id={q.id} active={q.active} /></td></tr>)}</tbody>
      </table></div>{!data.questions.length && <p>No questions yet.</p>}
    </section>
    <section id="participants"><h2>Participants</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Roll Number</th><th>Score</th><th>Registered (UTC)</th></tr></thead><tbody>{data.participants.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.roll_number}</td><td>{p.total_score}</td><td>{formatUtc(p.created_at)}</td></tr>)}</tbody></table></div>{!data.participants.length && <p>No participants yet.</p>}</section>
    <section id="submissions"><h2>Submissions</h2><p>Page {page} of {pages} · 50 submissions per page</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Participant</th><th>Roll Number</th><th>Question</th><th>Submitted answer</th><th>Result</th><th>Points</th><th>Submitted (UTC)</th></tr></thead><tbody>{data.submissions.map(s=><tr key={s.id}><td>{s.participant_name}</td><td>{s.roll_number}</td><td>{s.challenge_code}</td><td>{s.submitted_answer}</td><td>{s.is_correct===null?'Pending':s.is_correct?'Correct':'Incorrect'}</td><td>{s.points_awarded}</td><td>{formatUtc(s.submitted_at)}</td></tr>)}</tbody></table></div>{!data.submissions.length && <p>No submissions on this page.</p>}
      <div className="admin-nav">{page>1 && <Link href={`/admin?page=${page-1}#submissions`}>Previous page</Link>}{page<pages && <Link href={`/admin?page=${page+1}#submissions`}>Next page</Link>}</div>
    </section>
    <section id="standings"><h2>Current leaderboard</h2><p><Link href="/leaderboard">Open live leaderboard</Link></p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Rank</th><th>Participant</th><th>Score</th></tr></thead><tbody>{data.leaderboard.map(p=><tr key={p.participant_id}><td>{p.rank}</td><td>{p.name}</td><td>{p.total_score}</td></tr>)}</tbody></table></div></section>
  </main>;
}
