import { NextRequest,NextResponse } from 'next/server';
import { authorizeAdmin,adminError,AdminHttpError } from '@/lib/admin-http';
import { isQuestionId } from '@/lib/admin-question';
import { readActiveQrQuestions,qrOrigin } from '@/lib/admin-qr';
import { challengeQrUrl,qrPng,qrSvg } from '@/lib/qr';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    await authorizeAdmin(request,false);
    const {id}=await params;
    if (!isQuestionId(id)) throw new AdminHttpError(404,'Active question not found.');
    const format=request.nextUrl.searchParams.get('format') || 'svg';
    if (!['svg','png'].includes(format)) throw new AdminHttpError(400,'Choose SVG or PNG.');
    const [question]=await readActiveQrQuestions(id);
    if (!question) throw new AdminHttpError(404,'Active question not found.');
    const url=challengeQrUrl(qrOrigin(),question.challenge_code);
    const body=format==='png'?new Uint8Array(await qrPng(url)):await qrSvg(url);
    return new NextResponse(body,{
      headers:{
        'Content-Type':format==='png'?'image/png':'image/svg+xml; charset=utf-8',
        'Content-Disposition':`${request.nextUrl.searchParams.get('download')==='1'?'attachment':'inline'}; filename="qr-${question.challenge_code}.${format}"`,
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
        ...(format==='svg'?{'Content-Security-Policy':"default-src 'none'; sandbox"}:{}),
      },
    });
  } catch(error) { return adminError(error); }
}
