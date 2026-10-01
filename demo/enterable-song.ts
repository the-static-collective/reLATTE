import {
  buildEnterableParticular,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
} from '../src/index.ts';

const sourceKeys = await generateP256KeyPair();
const receiverKeys = await generateP256KeyPair();

const crossing = await sealCrossingEnvelope({
  schema: 'relatte.crossing-envelope/v0',
  protocol_version: '0',
  source_particular: 'particular:demo-song',
  source_world: 'world:studio',
  source_history_head: null,
  parents: [],
  declared_kind: 'MEDIA_COMPOSITION',
  payload_refs: [
    { address: 'sha256:' + '1'.repeat(64), role: 'song', media_type: 'audio/mpeg' },
    { address: 'sha256:' + '2'.repeat(64), role: 'lyrics', media_type: 'text/plain' },
    { address: 'sha256:' + '3'.repeat(64), role: 'video', media_type: 'video/mp4' },
  ],
  requested_effect: null,
  capability_ref: null,
  privacy_policy: null,
  audience_policy: null,
  return_address: null,
  created_at: '2026-10-01T19:00:00.000Z',
  extensions: {},
}, sourceKeys);

const receipt = await sealReceipt({
  schema: 'relatte.receipt/v0',
  crossing_id: crossing.crossing_id,
  world_id: 'world:room',
  receiver_particular: 'particular:listener',
  kind: 'VERIFIED',
  semantic_effect: 'none',
  contract_ref: null,
  pre_state_ref: null,
  post_state_ref: null,
  descendant_refs: [],
  residual_refs: [],
  note: null,
  created_at: '2026-10-01T19:01:00.000Z',
  extensions: {},
}, receiverKeys);

console.log(JSON.stringify(
  await buildEnterableParticular(crossing.crossing_id, [crossing, receipt]),
  null,
  2,
));
