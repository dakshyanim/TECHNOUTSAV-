import { NextRequest } from 'next/server';
import { authorizeAdmin,readAdminJson,adminJson,adminError,AdminHttpError } from '@/lib/admin-http';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { parseEventState,validateEventAction } from '@/lib/event-types';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
  try {
    await authorizeAdmin(request);
    const action=validateEventAction(await readAdminJson(request));
    if(!action)throw new AdminHttpError(400,'Choose an event action and a duration from 1 second to 24 hours.');
    const {data,error}=await createDatabaseClient().rpc('admin_control_event',{p_action:action.action,p_seconds:action.seconds,p_expected_version:action.version});
    if(error?.code==='40001')throw new AdminHttpError(409,'Event controls changed in another window. Refresh and try again.');
    if(error?.code==='22023')throw new AdminHttpError(400,'The challenge is already running or the duration is invalid.');
    if(error)throw new AdminHttpError(503,'Event controls unavailable. Check the database and migration 202610220011_event_timer.sql.');
    return adminJson({event:parseEventState(data)});
  }catch(error){return adminError(error);}
}
