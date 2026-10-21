import { createServerSupabaseClient } from '@/lib/supabase/server';
import { parseEventState } from '@/lib/event-types';
import { sharePublicQuery } from '@/lib/shared-query';

export const getEventState=sharePublicQuery(async()=>{
  const {data,error}=await createServerSupabaseClient().rpc('get_event_state').abortSignal(AbortSignal.timeout(8000));
  if(error)throw new Error('Event status unavailable.');
  return parseEventState(data);
});
