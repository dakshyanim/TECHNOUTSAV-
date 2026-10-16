import { NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminTokenHash } from '@/lib/admin-auth';
import { createDatabaseClient } from '@/lib/supabase/admin';
import { adminError,adminJson,authorizeAdmin } from '@/lib/admin-http';

export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request);
    const token=request.cookies.get(ADMIN_COOKIE)?.value;
    if (!token) throw new Error('Missing administrator session.');
    const {error}=await createDatabaseClient().rpc('revoke_admin_session',{p_token_hash:adminTokenHash(token)});
    if (error) throw new Error('Unable to revoke administrator session.');
    const result=adminJson({redirectTo:'/admin/login'});
    result.cookies.set(ADMIN_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
    return result;
  } catch(error) { return adminError(error); }
}
