import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin-auth';
import { readRequestBody, RequestBodyError } from '@/lib/request-body';
import { hasAllowedRequestOrigin } from '@/lib/request-origin';

export class AdminHttpError extends Error {
  status: number;
  constructor(status: number,message: string) { super(message); this.status=status; }
}
export async function authorizeAdmin(request: NextRequest,mutation = true) {
  if (!await isAdmin()) throw new AdminHttpError(401,'Administrator login required.');
  if (mutation) requireSameOrigin(request);
}
export function requireSameOrigin(request: NextRequest) {
  if (!hasAllowedRequestOrigin(request)) {
    if (process.env.NODE_ENV === 'development') console.warn('Request origin rejected. Check APP_ORIGIN and the browser address.');
    throw new AdminHttpError(403,'Submit this request from the application.');
  }
}
export async function readAdminJson(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AdminHttpError(415,'Expected JSON.');
  const body = await readRequestBody(request,16000);
  try { return JSON.parse(body) as unknown; }
  catch { throw new AdminHttpError(400,'Invalid JSON.'); }
}
export function adminJson(value: unknown,status=200) {
  return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
}
export function adminError(error: unknown) {
  if (error instanceof RequestBodyError) return adminJson({message:error.message},error.status);
  if (error instanceof AdminHttpError) return adminJson({message:error.message},error.status);
  console.error('Admin request unavailable.');
  return adminJson({message:'Admin service is temporarily unavailable.'},503);
}
