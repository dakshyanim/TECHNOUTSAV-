import { randomBytes, scrypt, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const ADMIN_SESSION_SECONDS = 4 * 60 * 60;
export function validAdminConfig(hash: string | undefined, secret: string | undefined) {
  return Boolean(hash && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) && secret && secret.length >= 32);
}
export async function createPasswordHash(password: string) {
  if (password.length < 16 || password.length > 256) throw new Error('Use an admin password of 16–256 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyAdminPassword(password: string, hash: string) {
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) || password.length > 256) return false;
  const [,salt,expected] = hash.split(':');
  const actual = await derive(password,salt,64) as Buffer;
  return timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
function signingKey(hash: string,secret: string) {
  return createHmac('sha256',secret).update(`techno-admin:${hash}`).digest();
}
export function createAdminToken(hash: string,secret: string,now = Math.floor(Date.now()/1000)) {
  if (!validAdminConfig(hash,secret)) throw new Error('Admin authentication is not configured.');
  const payload = Buffer.from(JSON.stringify({v:1,role:'admin',iat:now,exp:now+ADMIN_SESSION_SECONDS,nonce:randomBytes(32).toString('hex')})).toString('base64url');
  return `${payload}.${createHmac('sha256',signingKey(hash,secret)).update(payload).digest('hex')}`;
}
export function verifyAdminToken(token: string,hash: string,secret: string,now = Math.floor(Date.now()/1000)) {
  if (!validAdminConfig(hash,secret) || token.length > 1000) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const expected = createHmac('sha256',signingKey(hash,secret)).update(parts[0]).digest();
  if (!timingSafeEqual(expected,Buffer.from(parts[1],'hex'))) return false;
  try {
    const p = JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    return p.v === 1 && p.role === 'admin' && /^[a-f0-9]{64}$/.test(p.nonce)
      && Number.isInteger(p.iat) && Number.isInteger(p.exp) && p.iat <= now+30
      && p.exp > now && p.exp-p.iat === ADMIN_SESSION_SECONDS;
  } catch { return false; }
}
