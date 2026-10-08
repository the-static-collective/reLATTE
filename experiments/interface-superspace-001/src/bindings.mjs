// Execution-only bindings to independently exposed boundary operations.
// No route selection, goal inspection, or path sequence lives in this module.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { makeUdpPackets, reassembleUdpPackets } from '../../alien-adapter-001/udp-datagram-adapter.ts';
import { encodePayloadAsMidi, decodePayloadFromMidi } from '../../alien-midi-002/midi-event-adapter.ts';
import { observeFilesystem } from '../../polyglot-crossing-001/filesystem-adapter.ts';
import { observeHttp } from '../../polyglot-crossing-001/http-adapter.ts';
import { makeObservation } from '../../polyglot-crossing-001/common.ts';
import { generateP256KeyPair, sealCrossingEnvelope, sealReceipt } from '../../../src/protocol.ts';
import { readJSON } from './registry.mjs';
import { digest, occurrence } from './receipts.mjs';
import { verifyCrossing } from './verifier.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = name => 'binding:' + hash(Buffer.from(name)).slice(0,8);
const artifact = (representation, bytes, value, native, facts, extras = {}) => ({ representation, bytes: Buffer.from(bytes), value, native_ref: occurrence('native') + ':' + digest(native), evidence: { native: JSON.parse(JSON.stringify(native)), facts }, ...extras });
function python(code, args, input, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('python3', ['-c', code, ...args], { env: { ...process.env, ...env }, stdio: ['pipe','pipe','pipe'] });
    const out=[], err=[]; const timer=setTimeout(() => { proc.kill(); reject(new Error('PROCESS_TIMEOUT')); },15000);
    proc.on('error', error => { clearTimeout(timer); reject(error); });
    proc.stdout.on('data', b=>out.push(b)); proc.stderr.on('data', b=>err.push(b));
    proc.on('close', status => { clearTimeout(timer); if (status !== 0) reject(new Error('PROCESS_EXIT:' + status + ':' + Buffer.concat(err).toString())); else resolvePromise({ stdout: Buffer.concat(out), status }); });
    proc.stdin.end(JSON.stringify(input));
  });
}
export async function discoverExternal({ donorRoot, discoveryRoot }) {
  const manifest = resolve(donorRoot,'integrations/ghot/adapter-manifest.json');
  const result = await python('import sys,json; sys.path.insert(0,sys.argv[1]); from ghot.external_adapters import external_executor_records; print(json.dumps(external_executor_records()))', [discoveryRoot], {}, { GHOT_ADAPTER_MANIFESTS: manifest });
  return JSON.parse(result.stdout);
}
export function createEnvironment(registry, options = {}) {
  const bindings = new Map(), resources = {}, cleanup = [];
  const install = (name, run, verify = async (_a,b) => !!b.evidence.native) => {
    const id=key(name); bindings.set(id,{ contract_digest: digest(registry.contracts[id]), run, verify });
  };
  const sourceBytes = a=>Buffer.from(a.bytes);
  install('json-serialization', async a => {
    const value = JSON.parse(sourceBytes(a).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON_OBJECT_REQUIRED');
    return artifact('process.stdin.json', a.bytes, value, { stdin_sha256: hash(a.bytes) }, ['json-object']);
  });
  install('bounded-process', async a => {
    const manifest = resolve(options.donorRoot,'integrations/ghot/adapter-manifest.json');
    const manifestValue = JSON.parse(await readFile(manifest,'utf8'));
    if(digest(manifestValue)!==digest(await readJSON('fixtures/field-lab-external-manifest.json'))) throw new Error('MANIFEST_CONTRACT_DRIFT');
    const spec = manifestValue.capabilities[0];
    if (spec.limits.network !== false || spec.limits.arbitrary_shell !== false || spec.protocol !== 'stdin-json/stdout-json-v0') throw new Error('MANIFEST_CONSTRAINT_DRIFT');
    const result = await python('import sys,json; sys.path.insert(0,sys.argv[1]); from ghot.external_adapters import execute_external_adapter; print(json.dumps(execute_external_adapter(sys.argv[2],json.load(sys.stdin))))', [options.discoveryRoot,spec.capability], a.value, { GHOT_ADAPTER_MANIFESTS: manifest });
    const value = JSON.parse(result.stdout);
    return artifact('bounded.analysis.result', result.stdout, value, { exit_status: result.status, manifest_digest: digest(spec), capability: spec.capability, process_stdout_digest: hash(result.stdout) }, ['exit-zero','manifest-result']);
  });
  install('stdout-observation', async a => artifact('process.stdout.json', a.bytes, a.value.result, { stdout_digest: hash(a.bytes), protocol: 'stdin-json/stdout-json-v0' }, ['stdout-json']));
  install('receipt-extraction', async a => {
    const receipt = a.value.artifact, bytes=Buffer.from(receipt.receipt_text,'utf8');
    if (hash(bytes) !== receipt.receipt_sha256) throw new Error('CONTENT_ADDRESS_MISMATCH');
    const receiptJSON = JSON.parse(bytes);
    if (!receiptJSON.schema || !a.value.receipt) throw new Error('MISSING_RECEIPT');
    if (options.outputDir) { await mkdir(options.outputDir,{recursive:true}); await writeFile(resolve(options.outputDir,hash(bytes)+'.json'),bytes); }
    return artifact('content.addressed.bytes', bytes, receiptJSON, { receipt_sha256: hash(bytes), manifest_result: a.value.kind, receipt: receiptJSON }, ['content-addressed','ordered']);
  });
  install('receipt-observation', async a => artifact('adapter.observation', a.bytes, null, a.evidence.native, ['observed'], { observation: { native_id:a.native_ref,observed_bytes:a.bytes,media_type:'application/json',native_claims:a.evidence.native } }));
  install('fragment', async a => {
    const packets=makeUdpPackets(a.bytes,occurrence('session'));
    return artifact('indexed.fragments',a.bytes,packets,{ packet_count:packets.length,packet_ids:packets.map(p=>p.packet_id) },['indexed']);
  });
  install('datagram-send', async a => {
    const receiver=dgram.createSocket('udp4'), sender=dgram.createSocket('udp4');
    cleanup.push(async()=>{ receiver.close(); sender.close(); });
    const wire=[];
    await new Promise((res,rej)=>{ receiver.once('error',rej); receiver.bind(0,'127.0.0.1',res); });
    await new Promise((res,rej)=>{ sender.once('error',rej); sender.bind(0,'127.0.0.1',res); });
    const packets=a.value, order=packets.length>1?[packets.at(-1),packets[0],packets[0],...packets.slice(1,-1)]:[packets[0],packets[0]];
    // Reception begins before emission; completion/observation is a separate boundary.
    resources.received=new Promise((res,rej)=>{
      const timer=setTimeout(()=>rej(new Error('UDP_RECEIVE_TIMEOUT')),3000);
      receiver.on('message',message=>{ wire.push(Buffer.from(message)); if(wire.length===order.length){ clearTimeout(timer);res(wire); } });
    });
    resources.received.catch(()=>{});
    for(const packet of order) await new Promise((res,rej)=>sender.send(Buffer.from(JSON.stringify(packet)),receiver.address().port,'127.0.0.1',e=>e?rej(e):res()));
    const native={ session_id:packets[0].session_id,sender:sender.address(),receiver:receiver.address(),emission_order:order.map(p=>p.index),sent:order.length,delivery_guarantee:'none' };
    resources.udpNative=native;
    return artifact('sent.datagrams',a.bytes,null,native,['unordered','duplicates']);
  });
  install('datagram-receive',async a=>{
    const wire=await resources.received, arrivals=wire.map(b=>JSON.parse(b));
    return artifact('received.datagrams',a.bytes,wire,{ ...resources.udpNative, arrival_order:arrivals.map(p=>p.index),datagrams:arrivals },['arrivals']);
  });
  install('indexed-reassembly',async a=>{
    const recovered=reassembleUdpPackets(a.value);
    return artifact('reassembled.bytes',recovered.bytes,recovered,{ ...a.evidence.native, duplicate_count:recovered.duplicate_count,payload_sha256:recovered.payload_sha256 },['ordered','complete']);
  });
  install('datagram-observation',async a=>artifact('adapter.observation',a.bytes,null,a.evidence.native,['observed'],{ observation:makeObservation('udp-datagram-swarm',a.native_ref,a.bytes,'application/octet-stream',a.evidence.native) }));
  install('event-encode',async a=>{
    const midi=encodePayloadAsMidi(a.bytes,options.midiOptions);
    return artifact('smf.events',a.bytes,midi,{ file_sha256:hash(midi),file_base64:midi.toString('base64'),channels:[0,1] },['ordered','timed-events']);
  });
  install('event-observe',async a=>{
    const midi=Buffer.from(a.value), facts=decodePayloadFromMidi(midi);
    return artifact('observed.smf.events',a.bytes,midi,{ ...a.evidence.native, ...facts, bytes:undefined },['event-evidence']);
  });
  install('event-decode',async a=>{
    const decoded=decodePayloadFromMidi(a.value);
    return artifact('reconstructed.bytes',decoded.bytes,decoded,{ ...a.evidence.native, last_tick:decoded.last_tick,tempo_us_per_quarter:decoded.tempo_us_per_quarter,division:decoded.division,note_event_count:decoded.note_event_count },['complete']);
  });
  install('event-observation',async a=>artifact('adapter.observation',a.bytes,null,a.evidence.native,['observed'],{observation:makeObservation('midi-event-stream',a.native_ref,a.bytes,'audio/midi',a.evidence.native)}));
  install('file-observe',async a=>{
    const result=await observeFilesystem(a.bytes);cleanup.push(result.cleanup);
    return artifact('file.bytes',result.observation.observed_bytes,result.observation,result.observation.native_claims,['ordered']);
  });
  install('file-evidence',async a=>artifact('adapter.observation',a.bytes,null,a.evidence.native,['observed'],{observation:{...a.value,native_id:a.value.native_id+':'+a.native_ref}}));
  install('request-response',async a=>{
    const result=await observeHttp(a.bytes);cleanup.push(result.cleanup);
    return artifact('http.representation',result.observation.observed_bytes,result.observation,result.observation.native_claims,['ordered','representation-observed']);
  });
  install('response-evidence',async a=>artifact('adapter.observation',a.bytes,null,a.evidence.native,['observed'],{observation:a.value}));
  install('prefix-projection',async a=>{
    const reduced=Buffer.from(a.bytes).subarray(0,8);
    if(a.bytes.length<=8) throw new Error('PROJECTION_REQUIRES_LONG_SOURCE');
    return artifact('reduced.bytes',reduced,null,{ transformation:'prefix projection: retain first eight bytes; discard suffix',source_digest:digest(a.bytes),original_length:a.bytes.length,recovery:'unsupported' },['ordered','descendant'],{residuals:[{lost:'suffix',recoverable:false}]});
  },async(a,b)=>a.bytes.length>8&&b.bytes.length===8&&b.bytes.equals(Buffer.from(a.bytes).subarray(0,8)));
  install('projection-observation',async a=>artifact('adapter.observation',a.bytes,null,a.evidence.native,['observed'],{observation:{ native_id:a.native_ref,observed_bytes:a.bytes,media_type:'application/octet-stream',native_claims:a.evidence.native }}));
  const cross=async (a,context)=>{
    if(!a.observation) throw new Error('RECEIVER_REQUIRES_OBSERVATION');
    const signer=await generateP256KeyPair(),receiver=await generateP256KeyPair();
    const now=new Date().toISOString();
    const crossing=await sealCrossingEnvelope({schema:'relatte.crossing-envelope/v0',protocol_version:'0',
      source_particular:context.parent.particular_id,source_world:'interface-experiment',source_history_head:null,
      parents:[],declared_kind:'EXPERIMENTAL_INTERFACE_OBSERVATION',
      payload_refs:[{address:'sha256:'+hash(a.bytes),role:'observed-interface-bytes',media_type:a.observation.media_type}],
      requested_effect:{kind:'candidate-ingress',authority:'receiver-local'},capability_ref:null,
      privacy_policy:null,audience_policy:null,return_address:'interface-experiment:return',created_at:now,
      extensions:{interface_superspace_001:{route_id:context.plan.route_id,execution_id:context.execution_id,
        plan_digest:context.plan.plan_digest,native_id:a.native_ref,native_claims:a.evidence.native,
        source:structuredClone(context.history.source),ancestry:structuredClone(context.history.particulars),
        relation_receipts:structuredClone(context.history.actual_relation_receipts),authority:[]}}},signer);
    // The receiver decision is local and comes from a separately installed policy.
    const disposition=await (options.receiverPolicy??(()=> 'R3_HOLD'))(a.observation);
    const receipt=await sealReceipt({schema:'relatte.receipt/v0',crossing_id:crossing.crossing_id,
      world_id:'interface-experiment:receiver',receiver_particular:'receiver:local',kind:disposition,
      semantic_effect:'local-only',contract_ref:null,pre_state_ref:null,post_state_ref:null,
      descendant_refs:[],residual_refs:[],note:'Local policy; interface compatibility does not admit.',
      created_at:now,extensions:{interface_superspace_001:{authority_scope:'THIS_RECEIVER_ONLY'}}},receiver);
    return artifact('relatte.observation',a.bytes,{crossing,receipt},{crossing_id:crossing.crossing_id,receiver_receipt:receipt},['crossing-verified','receiver-local'],{crossing,receipt});
  };
  install('receiver-crossing',cross,async(_a,b)=>verifyCrossing(b));
  install('verified-receiver-crossing',cross,async(_a,b)=>verifyCrossing(b));
  const nextStage=async(a,phase,representation,facts)=>{
    const next=await resources.vanilla.next();
    if(next.done||next.value.phase!==phase) throw new Error('NATIVE_PHASE_MISMATCH');
    const stage=next.value;
    return artifact(representation,stage.bytes,null,stage.native,facts,{observation:stage.observation});
  };
  install('client-connect',async a=>{
    const { vanillaStages }=await import('../../alien-minecraft-vanilla-005/vanilla-playthrough.mjs');
    resources.vanilla=vanillaStages(a.bytes); cleanup.push(()=>resources.vanilla.return());
    return nextStage(a,'client-connected','client.connected',['client-live']);
  });
  install('client-actuate',a=>nextStage(a,'world-mutated','world.mutated',['mutated']));
  install('world-observe',a=>nextStage(a,'world-observed','world.observed',['world-observed']));
  install('server-verify',a=>nextStage(a,'server-verified','adapter.observation',['observed','ordered']),async(_a,b)=>!!b.observation && b.evidence.native.serverVerification.length===b.evidence.native.placed.length);
  return { bindings,cleanup,resources,grants:options.grants??[],witnesses:options.witnesses??[],network:options.network??false,local_state:options.local_state??true };
}
