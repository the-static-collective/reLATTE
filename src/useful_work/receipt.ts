import { sealReceipt } from '../protocol.ts';
import type { P256KeyMaterial } from '../protocol.ts';
import type { VerificationResult } from './verifier.ts';

/** Domain attestation in an existing signed Receipt; never admission or economic authority. */
export async function verificationReceipt(report: VerificationResult, keys: P256KeyMaterial, createdAt: string) {
  return sealReceipt({
    schema: 'relatte.receipt/v0', crossing_id: report.crossing_id,
    world_id: 'world:useful-work-verifier', receiver_particular: 'particular:useful-work-verifier',
    kind: report.errors.length ? 'FAILED' : 'VERIFIED', semantic_effect: 'none',
    contract_ref: 'contract:useful-work/julia-q24-v1', pre_state_ref: null, post_state_ref: null,
    descendant_refs: [], residual_refs: Object.values(report.observed_hashes).map(hash => `sha256:${hash}`),
    note: 'Attests only to the explicit useful_work claims; no ownership, admission, or economic value.',
    created_at: createdAt,
    extensions: {
      useful_work: report,
      laws: ['POSSESSION ≠ OWNERSHIP', 'RECEIPT ≠ TRUTH', 'STRUCTURAL VERIFICATION ≠ COMPUTATIONAL VERIFICATION', 'COMPUTATIONAL VERIFICATION ≠ ECONOMIC VALUE'],
    },
  }, keys);
}
