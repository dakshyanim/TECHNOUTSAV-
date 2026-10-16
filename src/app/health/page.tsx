import Link from 'next/link';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  const health = await checkHealth();
  return (
    <main>
      <p className="eyebrow">SYSTEM HEALTH</p>
      <h1>{health.status === 'ok' ? 'All systems ready' : 'Setup needs attention'}</h1>
      <section>
        <dl><dt>Application</dt><dd>{health.app}</dd><dt>Database</dt><dd>{health.database}</dd><dt>Checked at (UTC)</dt><dd>{health.timestamp}</dd></dl>
        {health.database === 'not_configured' && <p>Set the Supabase URL and publishable key in .env.local, then restart the development server.</p>}
        {health.database === 'unavailable' && <p>Check your Supabase credentials, network connection, and health-check migration.</p>}
        <p><Link href="/health">Check again</Link> · <a href="/api/health">JSON endpoint</a></p>
      </section>
      <Link href="/">← Home</Link>
    </main>
  );
}
