/**
 * Authentication throttling policy with an in-memory store and a fake clock.
 * Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import {
  clientIp,
  isSignInLocked,
  recordSignInFailure,
  recordSignInSuccess,
  registerSignUpAttempt,
  SIGNIN_MAX_PER_EMAIL,
  SIGNIN_MAX_PER_IP,
  SIGNIN_WINDOW_MS,
  SIGNUP_MAX_PER_IP,
  type AttemptKind,
  type AttemptStore
} from '../../lib/auth/rate-limit';

let failures = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Store whose rows carry explicit timestamps so the window can be tested. */
class MemoryStore implements AttemptStore {
  rows: Array<{ kind: AttemptKind; id: string; at: Date }> = [];
  constructor(public now: Date = new Date()) {}
  async count(kind: AttemptKind, id: string, since: Date) {
    return this.rows.filter((r) => r.kind === kind && r.id === id && r.at >= since).length;
  }
  async add(kind: AttemptKind, id: string) {
    this.rows.push({ kind, id, at: new Date(this.now) });
  }
  async clear(kind: AttemptKind, id: string) {
    this.rows = this.rows.filter((r) => !(r.kind === kind && r.id === id));
  }
}

console.log('Authentication throttling');

(async () => {
  await check('locks an email after the maximum failures, not before', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNIN_MAX_PER_EMAIL - 1; i++) {
      await recordSignInFailure(store, 'a@x.com', null);
    }
    assert.equal(await isSignInLocked(store, 'a@x.com', null, store.now), false);
    await recordSignInFailure(store, 'a@x.com', null);
    assert.equal(await isSignInLocked(store, 'a@x.com', null, store.now), true);
  });

  await check('email matching ignores case and surrounding spaces; other emails unaffected', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNIN_MAX_PER_EMAIL; i++) await recordSignInFailure(store, ' A@X.com ', null);
    assert.equal(await isSignInLocked(store, 'a@x.com', null, store.now), true);
    assert.equal(await isSignInLocked(store, 'b@x.com', null, store.now), false);
  });

  await check('failures older than the window no longer count', async () => {
    const store = new MemoryStore(new Date('2026-10-08T10:00:00Z'));
    for (let i = 0; i < SIGNIN_MAX_PER_EMAIL; i++) await recordSignInFailure(store, 'a@x.com', null);
    const later = new Date(store.now.getTime() + SIGNIN_WINDOW_MS + 1000);
    assert.equal(await isSignInLocked(store, 'a@x.com', null, later), false);
  });

  await check('a successful sign-in clears that email\'s failures', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNIN_MAX_PER_EMAIL - 1; i++) await recordSignInFailure(store, 'a@x.com', null);
    await recordSignInSuccess(store, 'a@x.com');
    await recordSignInFailure(store, 'a@x.com', null);
    assert.equal(await isSignInLocked(store, 'a@x.com', null, store.now), false);
  });

  await check('one IP guessing many different emails is locked out', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNIN_MAX_PER_IP; i++) await recordSignInFailure(store, `u${i}@x.com`, '203.0.113.9');
    assert.equal(await isSignInLocked(store, 'new@x.com', '203.0.113.9', store.now), true);
    assert.equal(await isSignInLocked(store, 'new@x.com', '203.0.113.10', store.now), false);
  });

  await check('an unknown IP never creates a shared lock', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNIN_MAX_PER_IP + 5; i++) await recordSignInFailure(store, `u${i}@x.com`, null);
    assert.equal(await isSignInLocked(store, 'fresh@x.com', null, store.now), false);
  });

  await check('sign-up is limited per IP per hour and unknown IPs are not limited', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SIGNUP_MAX_PER_IP; i++) {
      assert.equal((await registerSignUpAttempt(store, '198.51.100.1', store.now)).limited, false);
    }
    assert.equal((await registerSignUpAttempt(store, '198.51.100.1', store.now)).limited, true);
    assert.equal((await registerSignUpAttempt(store, '198.51.100.2', store.now)).limited, false);
    assert.equal((await registerSignUpAttempt(store, null, store.now)).limited, false);
  });

  await check('clientIp takes the first forwarded hop and rejects empty values', async () => {
    assert.equal(clientIp('203.0.113.7, 10.0.0.1'), '203.0.113.7');
    assert.equal(clientIp(''), null);
    assert.equal(clientIp(null), null);
  });

  if (failures > 0) {
    console.error(`\nrate-limit.test.ts: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nrate-limit.test.ts: all checks passed');
})();
