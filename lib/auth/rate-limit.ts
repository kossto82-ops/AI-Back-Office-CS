/**
 * Authentication throttling policy (pure; the store is injected so the rules
 * are testable without a database).
 *
 *   sign-in   locked after 5 failed attempts for the same email within 15 minutes,
 *             or 20 failed attempts from the same IP within 15 minutes.
 *             A successful sign-in clears that email's failures.
 *   sign-up   at most 10 attempts per IP per hour.
 *
 * The limits are deliberately modest: a small team that mistypes a password a few
 * times must not be locked out, while online guessing becomes impractical.
 */

export type AttemptKind = 'signin' | 'signup';

export interface AttemptStore {
  count(kind: AttemptKind, identifier: string, since: Date): Promise<number>;
  add(kind: AttemptKind, identifier: string): Promise<void>;
  clear(kind: AttemptKind, identifier: string): Promise<void>;
}

export const SIGNIN_WINDOW_MS = 15 * 60 * 1000;
export const SIGNIN_MAX_PER_EMAIL = 5;
export const SIGNIN_MAX_PER_IP = 20;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
export const SIGNUP_MAX_PER_IP = 10;

export const TOO_MANY_SIGNIN_MESSAGE =
  'Too many failed sign-in attempts. Please wait 15 minutes and try again.';
export const TOO_MANY_SIGNUP_MESSAGE =
  'Too many sign-up attempts from this network. Please try again later.';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** First hop of x-forwarded-for, or null when it cannot be determined. */
export function clientIp(forwardedFor: string | null | undefined): string | null {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first ? first.slice(0, 45) : null;
}

export async function isSignInLocked(
  store: AttemptStore,
  email: string,
  ip: string | null,
  now: Date = new Date()
): Promise<boolean> {
  const since = new Date(now.getTime() - SIGNIN_WINDOW_MS);
  if ((await store.count('signin', `email:${normalizeEmail(email)}`, since)) >= SIGNIN_MAX_PER_EMAIL) {
    return true;
  }
  // Without a trustworthy IP there is no shared bucket to punish.
  if (ip && (await store.count('signin', `ip:${ip}`, since)) >= SIGNIN_MAX_PER_IP) {
    return true;
  }
  return false;
}

export async function recordSignInFailure(
  store: AttemptStore,
  email: string,
  ip: string | null
): Promise<void> {
  await store.add('signin', `email:${normalizeEmail(email)}`);
  if (ip) await store.add('signin', `ip:${ip}`);
}

export async function recordSignInSuccess(store: AttemptStore, email: string): Promise<void> {
  await store.clear('signin', `email:${normalizeEmail(email)}`);
}

/** Counts the attempt and reports whether it is over the limit. */
export async function registerSignUpAttempt(
  store: AttemptStore,
  ip: string | null,
  now: Date = new Date()
): Promise<{ limited: boolean }> {
  if (!ip) return { limited: false };
  const since = new Date(now.getTime() - SIGNUP_WINDOW_MS);
  const recent = await store.count('signup', `ip:${ip}`, since);
  if (recent >= SIGNUP_MAX_PER_IP) return { limited: true };
  await store.add('signup', `ip:${ip}`);
  return { limited: false };
}
