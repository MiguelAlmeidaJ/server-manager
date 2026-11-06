import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
export const SESSION_COOKIE = 'servermap_session';
export const SESSION_DAYS = 7;
export const digestSession = (raw: string): string => createHash('sha256').update(raw).digest('hex');
export const createSessionToken = (): string => randomBytes(32).toString('hex');
export const normalizeUsername = (name: string): string => name.trim().toLowerCase();

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, Buffer.from(salt, 'hex'), 64, SCRYPT_PARAMS) as Buffer;
  return 'scrypt$' + salt + '$' + hash.toString('hex');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hexHash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hexHash || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(hexHash)) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), 64, SCRYPT_PARAMS) as Buffer;
  const expected = Buffer.from(hexHash, 'hex');
  return timingSafeEqual(actual, expected);
}

export function cookieValue(header?: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return /^[a-f0-9]{64}$/i.test(value) ? value : undefined;
    }
  }
  return undefined;
}
export function sessionCookie(token: string, secure: boolean): string {
  return SESSION_COOKIE + '=' + token + '; HttpOnly; Path=/api; SameSite=Strict; Max-Age=' + (SESSION_DAYS * 86400) + (secure ? '; Secure' : '');
}
export function clearSessionCookie(secure: boolean): string {
  return SESSION_COOKIE + '=; HttpOnly; Path=/api; SameSite=Strict; Max-Age=0' + (secure ? '; Secure' : '');
}
