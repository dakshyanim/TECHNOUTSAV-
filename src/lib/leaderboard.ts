import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { LeaderboardEntry } from '@/lib/leaderboard-types';
import { sharePublicQuery } from '@/lib/shared-query';

export const getLeaderboard = sharePublicQuery(async (): Promise<LeaderboardEntry[]> => {
  const { data, error } = await createServerSupabaseClient().rpc('get_leaderboard')
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error('Leaderboard database query failed.');
  return (data || []).map((row: { rank: number; participant_id: string; name: string; total_score: number }) => ({
    rank: row.rank, participantId: row.participant_id, name: row.name, score: row.total_score,
  }));
});
