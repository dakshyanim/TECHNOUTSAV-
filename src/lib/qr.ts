import QRCode from 'qrcode';

export function normalizeQrOrigin(value: string) {
  const origin=new URL(value);
  if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path, credentials, query or fragment.');
  }
  return origin.origin;
}
export function challengeQrUrl(origin: string,code: string) {
  if (!/^[A-Z0-9-]{1,40}$/.test(code)) throw new Error('Invalid challenge code.');
  return `${normalizeQrOrigin(origin)}/challenge/${code}`;
}
const options={errorCorrectionLevel:'Q' as const,margin:4,color:{dark:'#000000ff',light:'#ffffffff'}};
export function qrSvg(url: string) { return QRCode.toString(url,{...options,type:'svg'}); }
export function qrPng(url: string) { return QRCode.toBuffer(url,{...options,type:'png',scale:20}); }
