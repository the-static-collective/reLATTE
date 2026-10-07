import assert from 'node:assert/strict';
import test from 'node:test';

import * as runtime from '../src/index.ts';

test('ordinary reLATTE runtime exports public FatherHand verification but not cold-root creation/recovery authority', () => {
  assert.equal(typeof runtime.verifyFatherHandFounding, 'function');
  assert.equal(typeof runtime.verifyFatherHandSuccession, 'function');
  assert.equal(typeof runtime.verifyOperationalDelegation, 'function');
  assert.equal(typeof runtime.verifyPeerTrust, 'function');

  for (const privateName of [
    'createFatherHandGenesis',
    'issueRecoverySet',
    'reconstructFatherHand',
    'beginRecoveryCeremony',
    'createKidBackupSet',
    'recoverKidShare',
    'createFounderNode',
    'trustPeerFounder',
    'delegateOperationalKey',
  ]) {
    assert.equal(
      Object.hasOwn(runtime, privateName),
      false,
      privateName + ' must stay out of the ordinary runtime export surface',
    );
  }
});
