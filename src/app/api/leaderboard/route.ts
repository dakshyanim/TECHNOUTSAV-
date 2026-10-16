import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ entries: await getLeaderboard() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('Leaderboard read unavailable.');
    return NextResponse.json({ message: 'Standings are temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
