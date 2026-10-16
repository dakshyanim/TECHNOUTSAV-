import type { Metadata } from 'next';
import Leaderboard from '@/components/leaderboard';
import { getLeaderboard } from '@/lib/leaderboard';
import type { LeaderboardEntry } from '@/lib/leaderboard-types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Live Leaderboard | Techno Utsav' };

export default async function LeaderboardPage() {
  let entries: LeaderboardEntry[] = [];
  let unavailable = false;
  try { entries = await getLeaderboard(); } catch { unavailable = true; }
  return <Leaderboard initialEntries={entries} initiallyUnavailable={unavailable} />;
}
