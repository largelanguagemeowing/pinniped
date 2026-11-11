import { MatrixError } from 'matrix-js-sdk';

export type FriendlyError = { title: string; message: string };

/**
 * Turns a failed `register/email/requestToken` into something a person can act on.
 * Synapse answers every SMTP failure (most often the relay rejecting the recipient,
 * i.e. a mistyped address) with a bare 500 M_UNKNOWN "An error was encountered when
 * sending the email", which on its own reads like a server outage.
 */
export const describeEmailTokenError = (
  err: MatrixError | undefined,
  email: string | undefined
): FriendlyError => {
  const address = email ? `“${email}”` : 'that address';
  switch (err?.errcode) {
    case 'M_THREEPID_IN_USE':
      return {
        title: 'Email already in use',
        message: `${address} is already linked to another account. Use a different email, or log in to that account instead.`,
      };
    case 'M_THREEPID_DENIED':
      return {
        title: 'Email not allowed',
        message: `This server does not accept registrations from ${address}. Try another email.`,
      };
    case 'M_INVALID_PARAM':
    case 'M_BAD_JSON':
    case 'M_INVALID_EMAIL':
      return {
        title: 'Check your email',
        message: `${address} does not look like a valid email address.`,
      };
    case 'M_LIMIT_EXCEEDED':
      return {
        title: 'Too many attempts',
        message: 'Too many verification emails were requested. Wait a minute, then try again.',
      };
    case 'M_THREEPID_MEDIUM_NOT_SUPPORTED':
    case 'M_SERVER_NOT_TRUSTED':
      return {
        title: 'Email verification unavailable',
        message:
          'This server cannot send verification emails right now. Leave the email field empty to register without one.',
      };
    default:
      return {
        title: 'Could not send the email',
        message: `The mail server could not deliver to ${address}. This almost always means a typo in the address, so check it and try again.`,
      };
  }
};

export const describeTokenStageError = (errorCode: string, error?: string): FriendlyError => {
  if (errorCode === 'M_UNAUTHORIZED' || errorCode === 'M_FORBIDDEN') {
    return {
      title: 'Token not accepted',
      message:
        'This registration token is wrong, expired, or already used up. Check it for typos or ask your server admin for a new one.',
    };
  }
  return { title: 'Registration token', message: error ?? 'The registration token was rejected.' };
};

const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'posteo.de',
  'mailbox.org',
];

const editDistance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

/** "x@gmial.com" -> "x@gmail.com". Only suggests for near-misses of well-known providers. */
export const suggestEmailFix = (email: string): string | undefined => {
  const at = email.lastIndexOf('@');
  if (at < 1) return undefined;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return undefined;
  let best: string | undefined;
  let bestDist = Infinity;
  COMMON_DOMAINS.forEach((d) => {
    const dist = editDistance(domain, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  });
  if (!best || bestDist === 0 || bestDist > 2) return undefined;
  return `${email.slice(0, at)}@${best}`;
};

export type TokenValidity = 'valid' | 'invalid' | 'unknown';

export const checkRegistrationToken = async (
  baseUrl: string,
  token: string,
  signal?: AbortSignal
): Promise<TokenValidity> => {
  try {
    const url = new URL(
      `${baseUrl.replace(/\/+$/, '')}/_matrix/client/v1/register/m.login.registration_token/validity`
    );
    url.searchParams.set('token', token);
    const res = await fetch(url, { signal });
    if (!res.ok) return 'unknown';
    const body = (await res.json()) as { valid?: unknown };
    if (body.valid === true) return 'valid';
    if (body.valid === false) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

export type UsernameAvailability = 'available' | 'taken' | 'invalid' | 'unknown';

export const checkUsernameAvailable = async (
  baseUrl: string,
  username: string,
  signal?: AbortSignal
): Promise<UsernameAvailability> => {
  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/_matrix/client/v3/register/available`);
    url.searchParams.set('username', username);
    const res = await fetch(url, { signal });
    if (res.ok) return 'available';
    const body = (await res.json().catch(() => ({}))) as { errcode?: string };
    if (body.errcode === 'M_USER_IN_USE' || body.errcode === 'M_EXCLUSIVE') return 'taken';
    if (body.errcode === 'M_INVALID_USERNAME') return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};
