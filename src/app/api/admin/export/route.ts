import { NextRequest,NextResponse } from 'next/server';
import { authorizeAdmin,adminError } from '@/lib/admin-http';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { makeCsv } from '@/lib/csv';
import { formatUtc } from '@/lib/utc';

export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request,false);
    const {data,error}=await createDatabaseClient().rpc('admin_export_results').abortSignal(AbortSignal.timeout(10000));
    if (error) throw new Error('Results export failed.');
    const rows=(data || []).map((r: {rank:number;name:string;roll_number:string;total_score:number;attempts:number;correct_answers:number;created_at:string})=>
      [r.rank,r.name,r.roll_number,r.total_score,r.attempts,r.correct_answers,formatUtc(r.created_at)]);
    return new NextResponse(makeCsv(['Rank','Name','Roll Number','Score','Attempts','Correct Answers','Registered At (UTC)'],rows),{
      headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="techno-utsav-results.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
    });
  } catch(error) { return adminError(error); }
}
