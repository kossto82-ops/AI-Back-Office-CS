/**
 * Knowledge publishing rules. Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import {
  canPublish,
  checkDocumentChange,
  roleInTeam
} from '../../lib/knowledge/permissions';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('Knowledge permissions');

check('owners may do everything', () => {
  for (const existingStatus of [undefined, 'draft', 'active', 'archived']) {
    for (const newStatus of ['draft', 'active', 'archived']) {
      assert.equal(checkDocumentChange({ role: 'owner', existingStatus, newStatus }).allowed, true);
    }
  }
});

check('members may create and edit drafts', () => {
  assert.equal(checkDocumentChange({ role: 'member', newStatus: 'draft' }).allowed, true);
  assert.equal(checkDocumentChange({ role: 'member', existingStatus: 'draft', newStatus: 'draft' }).allowed, true);
});

check('members cannot create or promote anything that the AI would use', () => {
  assert.equal(checkDocumentChange({ role: 'member', newStatus: 'active' }).allowed, false);
  assert.equal(checkDocumentChange({ role: 'member', existingStatus: 'draft', newStatus: 'active' }).allowed, false);
  assert.equal(checkDocumentChange({ role: 'member', existingStatus: 'draft', newStatus: 'archived' }).allowed, false);
});

check('members cannot edit, demote or archive published documents (no bypass through editing)', () => {
  for (const existingStatus of ['active', 'archived']) {
    for (const newStatus of ['draft', 'active', 'archived']) {
      const result = checkDocumentChange({ role: 'member', existingStatus, newStatus });
      assert.equal(result.allowed, false, `${existingStatus} -> ${newStatus}`);
      assert.ok(result.reason);
    }
  }
});

check('unknown or missing roles are treated as members, never as owners', () => {
  for (const role of [null, undefined, '', 'admin', 'OWNER']) {
    assert.equal(canPublish(role), false);
    assert.equal(checkDocumentChange({ role, newStatus: 'active' }).allowed, false);
  }
});

check('roleInTeam reads the caller\'s own membership', () => {
  const team = { teamMembers: [{ userId: 1, role: 'owner' }, { userId: 2, role: 'member' }] };
  assert.equal(roleInTeam(team, 2), 'member');
  assert.equal(roleInTeam(team, 99), null);
});

if (failures > 0) {
  console.error(`\npermissions.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\npermissions.test.ts: all checks passed');
