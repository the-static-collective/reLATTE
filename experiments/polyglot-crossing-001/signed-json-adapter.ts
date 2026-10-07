import { sha256Hex } from '../../src/canonical.ts';
import {
  generateP256KeyPair,
  sealReceipt,
  verifyReceipt,
} from '../../src/protocol.ts';
import { makeObservation, type AdapterObservation } from './common.ts';

export async function observeSignedJson(
  bytes: Uint8Array,
): Promise<AdapterObservation> {
  const payload = Buffer.from(bytes);
  const keys = await generateP256KeyPair();
  const signed = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: 'polyglot:signed-json-local',
    world_id: 'polyglot:signed-json',
    receiver_particular: 'particular:polyglot:signed-json',
    kind: 'RECEIVED',
    semantic_effect: 'none',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: 'Signed JSON substrate observation; not crossing admission.',
    created_at: '2026-10-07T00:00:00.000Z',
    extensions: {
      polyglot_signed_json: {
        schema: 'relatte.polyglot-signed-json/v0',
        payload_base64: payload.toString('base64'),
        payload_sha256: sha256Hex(payload),
        identity_model: 'canonical signed JSON receipt',
      },
    },
  }, keys);

  if (!(await verifyReceipt(signed))) throw new Error('SIGNED_JSON_INVALID');
  const extension = signed.extensions?.polyglot_signed_json;
  const observed = Buffer.from(extension?.payload_base64 ?? '', 'base64');
  if (sha256Hex(observed) !== extension?.payload_sha256) {
    throw new Error('SIGNED_JSON_PAYLOAD_MISMATCH');
  }

  return makeObservation(
    'signed-json',
    `signed-json:${signed.receipt_id}`,
    observed,
    'application/json',
    {
      receipt_id: signed.receipt_id,
      identity_model: 'signed canonical declaration',
    },
  );
}
