import { NextRequest, NextResponse } from 'next/server';
import { getParticipantSession } from '@/lib/session';
import { ChallengeError, getChallenge, recordChallengeAnswer } from '@/lib/challenges';
import { claimApiRequest } from '@/lib/api-limits';
import { readRequestBody, RequestBodyError } from '@/lib/request-body';
import { hasAllowedRequestOrigin } from '@/lib/request-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ code: string }> };

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
function handleError(error: unknown) {
  if (error instanceof RequestBodyError) return json({ message: error.message }, error.status);
  if (error instanceof ChallengeError) return json({ code: error.code, message: error.message }, error.status);
  console.error('Challenge request failed.');
  return json({ code: 'UNAVAILABLE', message: 'Challenge is temporarily unavailable.' }, 503);
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const participant = await getParticipantSession();
    if (!participant) return json({ code: 'UNAUTHENTICATED', message: 'Please register to continue.' }, 401);
    const { code } = await context.params;
    const result = await getChallenge(code, participant.id);
    // correct_answer is never selected or returned.
    return json(result);
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest, context: Context) {
  if (!hasAllowedRequestOrigin(request)) {
    return json({ message: 'Submit your answer from this application.' }, 403);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ message: 'Expected JSON.' }, 415);
  try {
    const participant = await getParticipantSession();
    if (!participant) return json({ code: 'UNAUTHENTICATED', message: 'Please register to continue.' }, 401);
    if (!await claimApiRequest('submission', participant.id)) return json({ message: 'Too many answer requests. Try again in one minute.' }, 429);
    const body = await readRequestBody(request, 8192);
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return json({ message: 'Invalid answer request.' }, 400); }
    const answer = input && typeof input === 'object' ? (input as Record<string, unknown>).answer : undefined;
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 1000 || /[\u0000]/u.test(answer)) {
      return json({ message: 'Enter an answer of 1–1000 characters.' }, 400);
    }
    const { code } = await context.params;
    // Identity is resolved exclusively from the verified session cookie.
    const result = await recordChallengeAnswer(code, participant.id, answer.trim());
    return json({ result }, 201);
  } catch (error) { return handleError(error); }
}
