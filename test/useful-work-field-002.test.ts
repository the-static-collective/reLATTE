import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { generateP256KeyPair } from '../src/protocol.ts';
import type { P256KeyMaterial } from '../src/protocol.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { rational } from '../src/useful_work/valuation/rational.ts';
import { WORLD_KEYS, worldId, roleIdentity } from '../src/useful_work/field_test/profile.ts';
import type { WorldRole } from '../src/useful_work/field_test/profile.ts';
import { acknowledge, inspectMessage, makeMessage, verifyAcknowledgement } from '../src/useful_work/wire_field/message.ts';
import { createLocalView, sealLocalView, verifyLocalView, viewId } from '../src/useful_work/wire_field/replay.ts';
import { Journal } from '../src/useful_work/wire_field/store.ts';
import type { Wire } from '../src/useful_work/settlement/wire.ts';
const repo=fileURLToPath(new URL('../',import.meta.url));
async function child(args:string[],cwd=repo) {
  return new Promise<{code:number|null;stdout:string;stderr:string}>((yes,no)=>{
    const p=spawn(args[0],args.slice(1),{cwd,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    const timer=setTimeout(()=>{p.kill('SIGTERM');no(new Error('WIRE_TEST_SUBPROCESS_TIMEOUT'));},210000);
    p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.once('error',e=>{clearTimeout(timer);no(e);});p.once('close',code=>{clearTimeout(timer);yes({code,stdout,stderr});});
  });
}
describe('Field 002 wire authentication and local causal replay',()=>{
  let dir:string,peers:Wire,keys:Record<string,P256KeyMaterial>;
  before(async()=>{
    dir=await mkdtemp(join(tmpdir(),'relatte-wire-unit-'));peers={};keys={};
    for(const role of Object.keys(WORLD_KEYS) as WorldRole[]){const card:Wire={schema:'useful-work.field-actor/v1',role,world_id:worldId(role),process_id:1,keys:{}};
      for(const name of WORLD_KEYS[role]){const k=await generateP256KeyPair();keys[role+'/'+name]=k;card.keys[name]={world_id:roleIdentity(role,name),public_key:k.publicKeyJwk};}peers[role]=card;}
  });
  after(async()=>{await rm(dir,{recursive:true,force:true});});
  test('message signatures bind run, exact body, recipient, topic authority and dependency references',async()=>{
    const p=await makeMessage('unit','A',['B'],'notice',[],{hello:'wire'},keys['A/primary'],new Date().toISOString());
    await inspectMessage(p,'unit',peers,'B');await assert.rejects(inspectMessage(p,'other',peers,'B'),/RUN/);await assert.rejects(inspectMessage(p,'unit',peers,'C'),/RECIPIENT/);
    const changed=structuredClone(p) as Wire;changed.body.hello='changed';await assert.rejects(inspectMessage(changed,'unit',peers,'B'),/BODY/);
    const wrong=await makeMessage('unit','D',['B'],'acceptance',[],{},keys['D/primary'],new Date().toISOString());await assert.rejects(inspectMessage(wrong,'unit',peers),/TOPIC_SENDER/);
    const substituted=structuredClone(peers);substituted.B.keys.primary=substituted.A.keys.primary;await assert.rejects(inspectMessage(p,'unit',substituted),/KEY_WORLD|SHARE_KEY/);
  });
  test('an absent dependency remains local PENDING; an independent cut needs no other world journal',async()=>{
    const parent=await makeMessage('unit','A',['B'],'notice',[],{parent:true},keys['A/primary'],new Date().toISOString());
    const packet=await makeMessage('unit','A',['B'],'notice',[parent.crossing.crossing_id],{child:true},keys['A/primary'],new Date().toISOString());
    const journal=await new Journal(join(dir,'pending'),'unit','B').load();
    const ack=await acknowledge(packet.crossing.crossing_id,'B',keys['B/primary'],new Date().toISOString());
    await journal.append('RECEIVE',packet.crossing.crossing_id,{first_seen:true,ack});await journal.append('PENDING',packet.crossing.crossing_id,{missing:[parent.crossing.crossing_id]});
    const cut=await sealLocalView({run_id:'unit',role:'B',peers,messages:[packet],events:journal.events},keys['B/primary'],new Date().toISOString());
    const v=await verifyLocalView(cut);assert.deepEqual(v.view.summary.pending_message_ids,[packet.crossing.crossing_id]);assert.equal(v.view.summary.claims.global_reconstruction_required,false);
    await assert.rejects(createLocalView({run_id:'unit',role:'B',peers,messages:[packet],events:[...journal.events, {...journal.events[1],kind:'APPLIED'}]}),/CHAIN/);
  });
  test('duplicate arrival is retained but a second local application is invalid; wrong-peer ACK cannot complete a delivery',async()=>{
    const packet=await makeMessage('unit','A',['B'],'notice',[],{same:true},keys['A/primary'],new Date().toISOString());
    const journal=await new Journal(join(dir,'duplicates'),'unit','B').load();const id=packet.crossing.crossing_id;
    const ack=await acknowledge(id,'B',keys['B/primary'],new Date().toISOString());
    await journal.append('RECEIVE',id,{first_seen:true,ack});await journal.append('APPLIED',id);await journal.append('RECEIVE',id,{first_seen:false,ack});
    const input={run_id:'unit',role:'B' as const,peers,messages:[packet],events:journal.events},cut=await sealLocalView(input,keys['B/primary'],new Date().toISOString());
    const v=await verifyLocalView(cut);assert.equal(v.view.summary.duplicate_deliveries_observed,1);assert.deepEqual(v.view.summary.applied_message_ids,[id]);
    await journal.append('APPLIED',id);await assert.rejects(createLocalView(input),/APPLICATION/);
    const other=await acknowledge(id,'C',keys['C/primary'],new Date().toISOString());await assert.rejects(verifyAcknowledgement(other,id,'B',peers),/ACKNOWLEDGEMENT/);
  });
  test('an authenticated message whose domain body fails remains replayable as a local failed application',async()=>{
    const packet=await makeMessage('unit','A',['B'],'packet',[],{malformed:'domain body'},keys['A/primary'],new Date().toISOString());
    const journal=await new Journal(join(dir,'failed-domain'),'unit','B').load(),id=packet.crossing.crossing_id;
    const ack=await acknowledge(id,'B',keys['B/primary'],new Date().toISOString());
    await journal.append('RECEIVE',id,{first_seen:true,ack});await journal.append('DOMAIN_FAILURE',id,{error:'INVALID_DOMAIN_BODY'});
    const cut=await sealLocalView({run_id:'unit',role:'B',peers,messages:[packet],events:journal.events},keys['B/primary'],new Date().toISOString());
    const v=await verifyLocalView(cut);assert.deepEqual(v.view.messages[0].body,{malformed:'domain body'});assert.equal(v.view.summary.application_failures.length,1);assert.deepEqual(v.view.summary.domain,{});
    assert.deepEqual(v.view.summary.failed_message_ids,[id]);assert.deepEqual(v.view.summary.pending_message_ids,[]);
  });
});

describe('Useful Work Field Test 002 — Crossing the Wire',{skip:process.platform!=='linux'},()=>{
  let dir:string,out:string,views:Record<string,Wire>;
  before(async()=>{
    dir=await mkdtemp(join(tmpdir(),'relatte-wire-live-'));out=join(dir,'run');
    const r=await child([process.execPath,'--experimental-strip-types','src/useful_work/cli_field_002.ts','local','examples/useful-work-001/julia-001.json',out]);
    assert.equal(r.code,0,r.stdout+r.stderr);views={};for(const role of Object.keys(WORLD_KEYS))views[role]=JSON.parse(await readFile(join(out,role,'public-local-view.json'),'utf8'));
  },{timeout:220000});
  after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
  test('all ten kernels survive autonomous wire composition with one retained contradiction and one expired service slot',async()=>{
    for(const role of ['A','B','C','D']){const v=await verifyLocalView(views[role]),d=v.view.summary.domain;
      assert.deepEqual(Object.keys(d.kernel_trace).filter(k=>/^\d{3}$/.test(k)).sort(),['001','002','003','004','005','006','007','008','009','010']);
      assert.equal(d.acceptance.choice,'ACCEPT');assert.deepEqual(d.acceptance.B_value,rational(12));assert.equal(d.acceptance.contradiction_count,1);assert.deepEqual(d.acceptance.expired_service_slots,[1]);
      assert.deepEqual(d.dissent.amount,rational(5));assert.equal(d.value_comparison.relation,'different-local-amounts');assert.equal(d.value_comparison.winner_selected,false);
      assert.equal(d.settlement.credit_ledger_changed,true);assert.equal(d.settlement.transfer_performed_by_relatte,false);assert.equal(d.settlement.universal_finality_asserted,false);
    }
  });
  test('latency, real disconnect, duplicate delivery, out-of-order delivery, retry and temporary partition are observable',async()=>{
    const events=await new Journal(join(out,'network-exerciser'),'field-wire-002','network-exerciser').load(), kinds=new Set(events.events.map(e=>e.kind));
    for(const kind of ['LATENCY','DISCONNECT_AFTER_FORWARD','DUPLICATE_DELIVERY','DELAY_FOR_REORDER','TEMPORARY_PARTITION','CONNECTION_FAILURE','DELAY_LATE_EVIDENCE'])assert.ok(kinds.has(kind),kind);
    assert.ok(views.C.view.summary.duplicate_deliveries_observed>=1);assert.ok(views.adapter.view.summary.duplicate_deliveries_observed>=1);
    assert.ok(views.B.view.events.some((e:Wire)=>e.kind==='PENDING'));assert.equal(views.B.view.summary.pending_message_ids.length,0);
    assert.ok(views.adapter.view.summary.transport_failures.some((e:Wire)=>e.recipient==='C'));assert.ok(views.B.view.summary.transport_failures.some((e:Wire)=>e.recipient==='adapter'));
  });
  test('D is actually offline and restarts from its own durable journal; B ACCEPT and the ledger need no D availability',async()=>{
    const d=views.D.view.events,unavailable=d.find((e:Wire)=>e.kind==='UNAVAILABLE'),starts=d.filter((e:Wire)=>e.kind==='START');assert.equal(starts.length,2);assert.notEqual(starts[0].detail.process_id,starts[1].detail.process_id);
    const b=views.B.view.events.find((e:Wire)=>e.kind==='SEND_INTENT'&&views.B.view.messages.find((m:Wire)=>m.crossing.crossing_id===e.message_id)?.crossing.extensions.organ_adapter.donor_claims.topic==='acceptance');
    assert.ok(Date.parse(b.observed_at)>Date.parse(unavailable.observed_at));assert.ok(Date.parse(b.observed_at)<Date.parse(starts[1].observed_at));
    const ledger=JSON.parse(await readFile(join(out,'adapter/ledger/state.json'),'utf8'));assert.deepEqual(ledger.balances,{A:'12',B:'88'});assert.equal(Object.keys(ledger.entries).length,1);
    const receives=views.adapter.view.events.filter((e:Wire)=>e.kind==='RECEIVE');const duplicate=receives.find((e:Wire)=>!e.detail.first_seen);assert.ok(duplicate);
    assert.equal(views.adapter.view.events.filter((e:Wire)=>e.kind==='APPLIED'&&e.message_id===duplicate.message_id).length,1);
  });
  test('late evidence receives a separate local HOLD while original acceptance and transfer remain preserved',async()=>{
    for(const role of ['A','B','C']){const d=views[role].view.summary.domain;assert.equal(d.late_evidence.choice,'HOLD');assert.equal(d.late_evidence.within_offerer_observed_window,false);assert.equal(d.acceptance.choice,'ACCEPT');assert.notEqual(d.acceptance.decision_id,d.late_evidence.decision_id);}
    for(const topic of ['presentation','late-presentation']) {
      const m=views.B.view.messages.find((m:Wire)=>m.crossing.extensions.organ_adapter.donor_claims.topic===topic);
      const receive=views.B.view.events.find((e:Wire)=>e.kind==='RECEIVE'&&e.message_id===m.crossing.crossing_id&&e.detail.first_seen);
      const exchange=views.B.view.messages.find((m:Wire)=>m.crossing.extensions.organ_adapter.donor_claims.topic===(topic==='presentation'?'acceptance':'late-hold'))!.body;
      assert.equal(exchange.decision.extensions.useful_work_offer_decision.observed_at,receive.observed_at);
    }
  });
  test('D retains and independently replays its signed unavailable-world prefix without later economic or dissent observations',async()=>{
    const cuts=await readdir(join(out,'D/cuts'));assert.equal(cuts.length,2);
    const deliveries=await Promise.all(cuts.map(async name=>verifyLocalView(JSON.parse(await readFile(join(out,'D/cuts',name),'utf8')))));
    const prefix=deliveries.find(d=>d.view.events.at(-1)!.detail.exit_code===75)!;assert.ok(prefix);assert.equal(prefix.view.summary.domain.acceptance,undefined);assert.equal(prefix.view.summary.domain.dissent,undefined);
    assert.equal(prefix.view.summary.claims.global_reconstruction_required,false);assert.ok(prefix.view.events.length<views.D.view.events.length);
  });
  test('worlds retain distinct local sets, ordering and cuts; replay never requires a global reconstruction',async()=>{
    assert.equal(new Set(Object.values(views).map(d=>d.view.view_id)).size,5);
    assert.notDeepEqual(views.A.view.summary.received_message_ids,views.B.view.summary.received_message_ids);
    for(const d of Object.values(views)){assert.equal(d.view.summary.claims.global_reconstruction_required,false);assert.equal(d.view.summary.claims.global_order_asserted,false);assert.equal(d.view.summary.claims.exactly_once_network_delivery_asserted,false);assert.equal(d.view.summary.claims.physical_geography_verified,false);}
    assert.equal(views.D.view.summary.domain.late_evidence,undefined);assert.equal(views.adapter.view.summary.domain.dissent,undefined);
  });
  test('rehashing cannot erase a failure, promote a HOLD, invent global agreement, or substitute another world cut',async()=>{
    for(const mutate of [(v:Wire)=>v.summary.claims.global_order_asserted=true,(v:Wire)=>v.summary.transport_failures=[],(v:Wire)=>v.summary.domain.late_evidence.choice='ACCEPT']){
      const d=structuredClone(views.B);mutate(d.view);const {view_id:_,...body}=d.view;d.view.view_id=viewId(body);await assert.rejects(verifyLocalView(d),/REPLAY_MISMATCH/);
    }
    await assert.rejects(verifyLocalView({...views.B,crossing:views.A.crossing}),/CUT_REFERENCE/);
    const changed=structuredClone(views.C);changed.view.events.splice(1,1);const {view_id:_,...body}=changed.view;changed.view.view_id=viewId(body);await assert.rejects(verifyLocalView(changed),/CHAIN/);
  });
  test('a single relocated world view replays without other journals, actors, ledger, OS collectors, server or mathematics',async()=>{
    const portable=join(dir,'portable');await cp(join(repo,'src'),join(portable,'src'),{recursive:true});await symlink(join(repo,'node_modules'),join(portable,'node_modules'),'dir');await writeFile(join(portable,'package.json'),'{"type":"module"}');
    await writeFile(join(portable,'local.json'),canonicalBytes(views.C));
    for(const path of ['resources/collectors.ts','algorithm.ts','worker.ts','verifier.ts','python_verifier.ts','challenge/worker.ts','challenge/typescript_checker.ts','challenge/python_checker.ts','merkle_native/worker.ts','merkle_native/typescript_checker.ts','merkle_native/python_checker.ts'])await rm(join(portable,'src/useful_work',path));
    const r=await child([process.execPath,'--experimental-strip-types','src/useful_work/cli_field_002.ts','verify','local.json','verified.json'],portable);assert.equal(r.code,0,r.stderr);
    const d=JSON.parse(await readFile(join(portable,'verified.json'),'utf8'));assert.equal(d.view.view_id,views.C.view.view_id);assert.equal(d.view.summary.domain.acceptance.choice,'ACCEPT');assert.deepEqual(d.view.summary.domain.dissent.amount,rational(5));
  });
});
