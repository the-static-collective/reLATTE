// Generates one *fictional*, public service-hours crossing for local testing.
// A fresh disposable source signing key stays only in this process's memory.
// Do not use this utility to sign business production changes.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { generateP256KeyPair, sealCrossingEnvelope } from '../../../src/protocol.ts';
import { sourceFingerprint, SOURCE_WORLD, SOURCE_PARTICULAR, ALLOWED_KIND } from '../receiver.mjs';
const target=process.argv[2];
if (!target || !target.endsWith('.json')) {
  console.error('Usage: node --experimental-strip-types experiments/cloudflare-do/scripts/lab-packet.mjs /absolute/path/pilot.json');
  process.exit(2);
}
const keys=await generateP256KeyPair();
const sha=createHash('sha256').update('fictional: Monday-Friday 09:00-21:00 America/Chicago').digest('hex');
const crossing=await sealCrossingEnvelope({
  schema:'relatte.crossing-envelope/v0',protocol_version:'0',
  source_world:SOURCE_WORLD,source_particular:SOURCE_PARTICULAR,
  source_history_head:null,parents:[],declared_kind:ALLOWED_KIND,
  payload_refs:[{address:'sha256:'+sha,role:'service-hours-proposal',media_type:'application/json'}],
  requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,
  return_address:null,created_at:new Date().toISOString(),extensions:{},
},keys);
await writeFile(target,JSON.stringify(crossing,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('PILOT_SIGNED_CROSSING_FILE='+target);
console.log('MW_TRUSTED_SOURCE_FINGERPRINT='+sourceFingerprint(keys.publicKeyJwk));
console.log('This demonstration key is ephemeral; generate a new packet for a fresh test namespace.');
