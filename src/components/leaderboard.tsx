'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type { LeaderboardEntry } from '@/lib/leaderboard-types';

export default function Leaderboard({ initialEntries, initiallyUnavailable }: {
  initialEntries: LeaderboardEntry[]; initiallyUnavailable: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [unavailable, setUnavailable] = useState(initiallyUnavailable);
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let queued = false;
    let lastStarted = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let cleanupChannel = () => {};

    function schedule() {
      if (!active || timeout) return;
      timeout = setTimeout(() => { timeout = undefined; void refresh(); }, Math.max(200 + Math.random() * 300, 750 - (Date.now() - lastStarted)));
    }
    async function refresh() {
      if (!active || document.hidden) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      lastStarted = Date.now();
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch('/api/leaderboard', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        if (!Array.isArray(data.entries)) throw new Error('Invalid response');
        if (active) {
          // Preserve database ranks/order. Never calculate scores from broadcasts.
          setEntries(data.entries); setUnavailable(false); setUpdatedAt(new Date().toISOString());
        }
      } catch { if (active) setUnavailable(true); }
      finally {
        clearTimeout(deadline); inFlight = false;
        if (queued) { queued = false; schedule(); }
      }
    }
    try {
      const supabase = getBrowserSupabaseClient();
      const channel = supabase.channel('techno-utsav:leaderboard', { config: { private: false } })
        .on('broadcast', { event: 'changed' }, schedule)
        .subscribe(status => {
          if (!active) return;
          setConnected(status === 'SUBSCRIBED');
          // Refetch after connecting/reconnecting to close missed-event gaps.
          if (status === 'SUBSCRIBED') schedule();
        });
      cleanupChannel = () => { void supabase.removeChannel(channel); };
    } catch { setConnected(false); }

    // Also repairs missed events and provides automatic fallback when offline.
    // Different intervals avoid a venue-wide polling/reconnect stampede.
    const interval = setInterval(schedule, 12000 + Math.random() * 6000);
    const onVisible = () => { if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', schedule);
    schedule();
    return () => {
      active = false; controller?.abort(); clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', schedule); cleanupChannel();
    };
  }, []);

  return <main className="leaderboard-shell">
    <header className="leaderboard-heading">
      <div><p className="eyebrow">TECHNO UTSAV · QR CHALLENGE</p><h1>Live leaderboard</h1></div>
      <p className={`leaderboard-status ${connected && !unavailable ? 'is-live' : ''}`} role="status">
        <span aria-hidden="true">● </span>{unavailable ? 'Reconnecting…' : connected ? 'Live' : 'Auto-updating'}
      </p>
    </header>
    <p className="leaderboard-note">Highest score leads. Ties go to the participant who reached that score first.</p>
    {unavailable && <p role="status" className="leaderboard-warning">Standings are temporarily unavailable. {entries.length ? 'Showing the last known results.' : 'Waiting for results.'} This display retries automatically.</p>}
    {entries.length ? <div className="leaderboard-table-wrap"><table className="leaderboard-table">
      <caption className="sr-only">Techno Utsav participant standings</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Participant</th><th scope="col">Score</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.participantId} className={entry.rank <= 3 ? `podium podium-${entry.rank}` : ''}>
        <td className="leaderboard-rank">{entry.rank}</td><td className="leaderboard-name">{entry.name}</td><td className="leaderboard-score">{entry.score}</td>
      </tr>)}</tbody>
    </table></div> : !unavailable && <section className="leaderboard-empty"><h2>The challenge starts here.</h2><p>Participants will appear as they register. Scores update as answers are submitted.</p></section>}
    <footer className="leaderboard-footer"><Link href="/challenge">Join the challenge</Link>
      {updatedAt && <span>Updated <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleTimeString()}</time></span>}
    </footer>
  </main>;
}
