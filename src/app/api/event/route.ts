import { NextResponse } from 'next/server';
import { getEventState } from '@/lib/event-state';
export const dynamic='force-dynamic';
export async function GET() {
  try {return NextResponse.json({event:await getEventState()},{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({message:'Challenge status is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
