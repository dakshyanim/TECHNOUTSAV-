import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { adminConfig, ADMIN_COOKIE } from '@/lib/admin-auth';
import { verifyAdminPassword, createAdminToken, ADMIN_SESSION_SECONDS } from '@/lib/admin-crypto';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { adminError, AdminHttpError, adminJson, readAdminJson, requireSameOrigin } from '@/lib/admin-http';

export const runtime='nodejs';
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const config=adminConfig();
    if (!config) throw new AdminHttpError(503,'Administrator authentication is not configured.');
    const input=await readAdminJson(request);
    const password=input && typeof input==='object' ? (input as Record<string,unknown>).password : undefined;
    if (typeof password!=='string' || !password || password.length>256) throw new AdminHttpError(400,'Enter your administrator password.');
    const identity=request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const key=createHash('sha256').update(identity).digest('hex');
    const {data:allowed,error}=await createDatabaseClient().rpc('admin_claim_login_attempt',{p_key:key});
    if (error) throw new Error('Admin login limiter unavailable.');
    if (!allowed) throw new AdminHttpError(429,'Too many login attempts. Try again in 15 minutes.');
    if (!await verifyAdminPassword(password,config.hash)) throw new AdminHttpError(401,'Invalid administrator password.');
    const result=adminJson({redirectTo:'/admin'});
    result.cookies.set(ADMIN_COOKIE,createAdminToken(config.hash,config.secret),{
      httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:ADMIN_SESSION_SECONDS,
    });
    return result;
  } catch(error) { return adminError(error); }
}
