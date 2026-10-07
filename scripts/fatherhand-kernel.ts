import {
  assertPublicArtifactSafe,
  beginRecoveryCeremony,
  createFatherHandGenesis,
  createFounderNode,
  createKidBackupSet,
  createOperationalKey,
  delegateOperationalKey,
  issueRecoverySet,
  recoverKidShare,
  retireFatherHand,
  retireOperationalKey,
  trustPeerFounder,
  verifyFatherHandFounding,
  verifyFatherHandSuccession,
  verifyOperationalDelegation,
  verifyPeerTrust,
} from '../src/fatherhand.ts';

export async function runFatherHandKernel(): Promise<Record<string, any>> {
  const father0 = await createFatherHandGenesis();
  const sanctuary = await createFounderNode(
    father0,
    'webz:the-static-collective/sanctuary',
    ['webz-world-identity', 'delegate-operational-peer-keys', 'delegate-relatte-receiver-key'],
  );
  if (!(await verifyFatherHandFounding(sanctuary.founding_statement))) {
    throw new Error('FOUNDING_COLD_VERIFY_FAILED');
  }

  const recovery = await issueRecoverySet(father0, 5, 3);
  // Simulate the real recovery condition: the original cold secret is gone
  // before any FatherKid quorum is exercised.
  retireFatherHand(father0);
  let twoShareRefused = false;
  try {
    const ceremony = await beginRecoveryCeremony(
      { fingerprint: father0.fingerprint, generation: father0.generation, public_key: father0.public_key },
      recovery.shares.slice(0, 2),
    );
    ceremony.close();
  } catch (error) {
    if (error instanceof Error && error.message === 'RECOVERY_QUORUM_NOT_MET') twoShareRefused = true;
    else throw error;
  }
  if (!twoShareRefused) throw new Error('TWO_SHARES_UNEXPECTEDLY_RECOVERED');

  const aBackups = await createKidBackupSet(recovery.shares[0], 3, 2);
  const recoveredA = await recoverKidShare(aBackups.slice(0, 2));
  if (recoveredA.lineage_id !== recovery.shares[0].lineage_id) {
    throw new Error('KID_DESCENDANT_CHANGED_PARENT_LINEAGE');
  }

  const ceremony = await beginRecoveryCeremony(
    { fingerprint: father0.fingerprint, generation: father0.generation, public_key: father0.public_key },
    [recoveredA, recovery.shares[1], recovery.shares[2]],
  );
  const succession = await ceremony.createSuccessor({
    reason: 'WEBZ-005 synthetic recovery kernel',
    retained_founder_fingerprints: [sanctuary.fingerprint],
    revoked_founder_fingerprints: [],
    previous_lineage_head: null,
  });
  ceremony.close();
  if (!(await verifyFatherHandSuccession(succession.statement))) {
    throw new Error('SUCCESSION_COLD_VERIFY_FAILED');
  }

  // A successor is not complete until it has its own fresh recovery children.
  const successorRecovery = await issueRecoverySet(succession.successor, 5, 3);

  const transport = await createOperationalKey();
  const delegated = await delegateOperationalKey(
    sanctuary,
    transport.public_key,
    'webz-peer-https',
    {
      serial: 1,
      not_before: '2026-10-07T00:00:00.000Z',
      not_after: '2027-10-07T00:00:00.000Z',
      endpoint_constraints: ['https://synthetic-sanctuary.invalid'],
      replaces_fingerprint: null,
    },
  );
  if (!(await verifyOperationalDelegation(
    delegated,
    sanctuary.fingerprint,
    'webz-peer-https',
    '2026-10-08T00:00:00.000Z',
    sanctuary.founding_statement,
  ))) {
    throw new Error('OPERATIONAL_DELEGATION_COLD_VERIFY_FAILED');
  }

  const remoteFather = await createFatherHandGenesis();
  const orchard = await createFounderNode(
    remoteFather,
    'webz:the-static-collective/orchard-022100',
    ['webz-world-identity'],
  );
  if (!(await verifyFatherHandFounding(orchard.founding_statement))) {
    throw new Error('REMOTE_FOUNDING_COLD_VERIFY_FAILED');
  }
  retireFatherHand(remoteFather);

  const trust = await trustPeerFounder(
    succession.successor,
    orchard.world_id,
    orchard.public_key,
    ['webz-peer-auth', 'receive-relatte-crossing'],
    {
      expires_at: '2027-10-07T00:00:00.000Z',
      invitation_id: 'invite:webz005:synthetic-orchard:001',
    },
  );
  if (!(await verifyPeerTrust(
    trust,
    succession.successor.public_key,
    orchard.public_key,
    orchard.world_id,
    'webz-peer-auth',
    '2026-10-08T00:00:00.000Z',
  ))) {
    throw new Error('PEER_TRUST_COLD_VERIFY_FAILED');
  }
  retireFatherHand(succession.successor);
  retireOperationalKey(transport);

  const report = {
    schema: 'webz.fatherhand-kernel-witness/v0',
    synthetic_only: true,
    network_used: false,
    all_root_handles_retired_before_report: true,
    operational_key_handle_retired_before_report: true,
    fatherhand_genesis: {
      fingerprint: father0.fingerprint,
      generation: father0.generation,
    },
    founder_node: {
      world_id: sanctuary.world_id,
      fingerprint: sanctuary.fingerprint,
      founding_statement_id: sanctuary.founding_statement.statement_id,
    },
    recovery: {
      total: recovery.total,
      threshold: recovery.threshold,
      distinct_lineages: recovery.shares.length,
      genesis_secret_retired_before_recovery: true,
      two_share_recovery_refused: twoShareRefused,
      child_descendants_recovered_one_lineage: recoveredA.lineage_id === recovery.shares[0].lineage_id,
    },
    succession: {
      old_fingerprint: father0.fingerprint,
      new_fingerprint: succession.successor.fingerprint,
      fresh_recovery_total: successorRecovery.total,
      fresh_recovery_threshold: successorRecovery.threshold,
      fresh_recovery_set_issued: successorRecovery.shares.length === 5,
      new_generation: succession.successor.generation,
      statement_id: succession.statement.statement_id,
      old_and_new_signatures_verified: true,
    },
    operational_delegation: {
      founder_fingerprint: sanctuary.fingerprint,
      operational_fingerprint: transport.fingerprint,
      statement_id: delegated.statement_id,
      scope: delegated.scope,
      verified: true,
    },
    peer_trust: {
      local_fatherhand_fingerprint: succession.successor.fingerprint,
      remote_world_id: orchard.world_id,
      remote_founder_fingerprint: orchard.fingerprint,
      statement_id: trust.statement_id,
      scopes: trust.scopes,
      verified: true,
      tofu_used: false,
    },
    laws: [
      'CHILD != PARENT',
      'ONE CHILD != FATHERHAND',
      'DESCENDANT REDUNDANCY != INDEPENDENT RECOVERY AUTHORITY',
      'RECOVERY != CONTINUATION',
      'FOUNDERNODE != HUMAN',
      'KEY PRESENTED != KEY TRUSTED',
      'TRUST MARK != ADMISSION',
    ],
    scope: 'network-free-synthetic-root-kernel;no-production-secrets;no-https',
  };
  assertPublicArtifactSafe(report);
  return report;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runFatherHandKernel()
    .then((report) => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
    .catch((error) => {
      process.stderr.write((error instanceof Error ? error.message : 'FATHERHAND_KERNEL_FAILED') + '\n');
      process.exitCode = 1;
    });
}
