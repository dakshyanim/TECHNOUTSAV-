import { NextRequest, NextResponse } from 'next/server';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { getParticipantSession, hashSessionToken, newSessionToken, SESSION_COOKIE, SESSION_SECONDS } from '@/lib/session';
import { validateRegistration } from '@/lib/registration';
import { challengeReturnPath } from '@/lib/return-path';
import { claimApiRequest } from '@/lib/api-limits';
import { readRequestBody, RequestBodyError } from '@/lib/request-body';
import { hasAllowedRequestOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';

function response(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!hasAllowedRequestOrigin(request)) return response('Registration must be submitted from this application.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response('Expected JSON.', 415);
  try {
    if (!await claimApiRequest('registration', 'global')) return response('Too many registration requests. Try again in one minute.', 429);
    const body = await readRequestBody(request, 4096);
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return response('Invalid registration details.', 400); }
    const valid = validateRegistration(input);
    if (!valid.ok) return response(valid.message, 400);
    const returnTo = challengeReturnPath((input as Record<string, unknown>).returnTo);

    const existing = await getParticipantSession();
    if (existing) {
      if (existing.roll_number.trim().toUpperCase() !== valid.rollNumber) return response('This browser is already registered for another roll number.', 409);
      return NextResponse.json({ redirectTo: returnTo }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const token = newSessionToken();
    const { error } = await createDatabaseClient().rpc('register_participant', {
      p_name: valid.name, p_roll_number: valid.rollNumber, p_token_hash: hashSessionToken(token),
    });
    if (error) {
      if (error.code === '23505') return response('This roll number is already registered. Use the original browser or contact the event organizer.', 409);
      if (error.code === '22023') return response('Invalid registration details.', 400);
      console.error('Registration database error:', error.code);
      return response('Registration is temporarily unavailable. Please try again.', 503);
    }
    const result = NextResponse.json({ redirectTo: returnTo }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    result.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/', maxAge: SESSION_SECONDS,
    });
    return result;
  } catch (error) {
    if (error instanceof RequestBodyError) return response(error.message, error.status);
    console.error('Registration service unavailable.');
    return response('Registration is temporarily unavailable. Please try again.', 503);
  }
}
