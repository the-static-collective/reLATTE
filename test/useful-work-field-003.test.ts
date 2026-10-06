import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { generateP256KeyPair } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { executeNativeJob, nativeOrganSpec, answerNativeChallenge } from '../src/useful_work/merkle_native/worker.ts';
import { createNativeChallenge, inspectNativeWork } from '../src/useful_work/merkle_native/exchange.ts';
import { nativeTypescriptChecker } from '../src/useful_work/merkle_native/typescript_checker.ts';
import { verifyNativeChallenge } from '../src/useful_work/merkle_native/verifier.ts';
import { nativeReceipt } from '../src/useful_work/merkle_native/receipt.ts';
import { createAudit } from '../src/useful_work/audit/accumulator.ts';
import { createEvidence } from '../src/useful_work/settlement/evidence.ts';
import { decide, publishOffer, verifyExchange } from '../src/useful_work/settlement/exchange.ts';
import type { OfferTerms } from '../src/useful_work/settlement/exchange.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { rational } from '../src/useful_work/valuation/rational.ts';
import { domainHash } from '../src/useful_work/audit_clock/policy.ts';
import { signer } from '../src/useful_work/settlement/wire.ts';
import type { Wire } from '../src/useful_work/settlement/wire.ts';
import { chooseDoor, crossChosenDoor, discover, inspectChoice, inspectDescriptor, inspectDoor, inspectDoorCrossing, inspectListing,
  publishDescriptor, publishDoor, publishListing, verifyDiscovery } from '../src/useful_work/door_market/model.ts';
import { marketViewId, verifyMarketView } from '../src/useful_work/door_market/archive.ts';
import { atomicExclusive } from '../src/useful_work/wire_field/store.ts';

const repo=fileURLToPath(new URL('../',import.meta.url)),base=Date.parse('2026-10-06T00:00:00Z'),at=(n:number)=>new Date(base+n).toISOString();
async function setup() {
  const [A,B,E,F,G,adapter,math]=await Promise.all(Array.from({length:7},()=>generateP256KeyPair()));
  const job=JSON.parse(await readFile(join(repo,'fixtures/useful-work-004-golden.json'),'utf8')).cases[0].job;
  const work=executeNativeJob(job),world='world:market-unit:A',native=await sealOpaqueOrganCrossing({...nativeOrganSpec(work.manifest,work.tree.header,at(0)),source_world:world},A);
  const n=await inspectNativeWork(native,canonicalBytes(job)),challenge=await createNativeChallenge(n,1,math,at(0)),response=await answerNativeChallenge(n,challenge,work.tree.bytes,A,at(1));
  // Named verification remains separate from the offerer's primary identity.
  const r=await nativeReceipt(await verifyNativeChallenge(n,challenge,response,nativeTypescriptChecker),math,at(2),{world_id:'world:market-unit:math',receiver_particular:'particular:test'});
  const audit=await createAudit(job,n.result_id,[{work:native,challenge,response,receipt:r}]);
  const evidence=await createEvidence({result_id:n.result_id,job_spec:job,work:native,audit,audit_history:null,service_history:null,resources:null,valuations:[]});
  const descriptor=await publishDescriptor(evidence,'market-unit',A,world,at(3));
  const terms:OfferTerms={description:'Local conditional credits.',transfer:{kind:'credit-ledger',system_ref:'external:test-ledger',asset_ref:'asset:local-credit',unit:'local-credit',amount:rational(12),from_ref:'B',to_ref:'A'},
    policy:{schema:'useful-work.acceptance-policy/v1',algorithm:'typed-evidence-all/v1',name:'B-bounded-math',clauses:[{kind:'audit',verifiers:[signer(r)],minimum_matching_entries:1,reject_contradictions:false}]},
    present_before:at(100),eligible_presenter:signer(native),target:null,settlement_adapter:{identity:{world_id:'world:market-unit:adapter',public_key:adapter.publicKeyJwk},allowed_record_origins:['operator-import/v1']}};
  const offer=await publishOffer(terms,B,'world:market-unit:B',at(0)),door=await publishDoor(offer,'https://b.example/cross','market-unit',B,'world:market-unit:B',at(1));
  const eTerms=structuredClone(terms);eTerms.description='Storage is a separate unit, not a converted credit price.';eTerms.transfer={...terms.transfer,kind:'resource',asset_ref:'asset:storage',unit:'byte-window',amount:rational(1048576),from_ref:'E'};
  const eOffer=await publishOffer(eTerms,E,'world:market-unit:E',at(0)),eDoor=await publishDoor(eOffer,'https://e.example/cross','market-unit',E,'world:market-unit:E',at(1));
  const fTerms=structuredClone(eTerms);fTerms.transfer={...eTerms.transfer,unit:'millisecond',asset_ref:'asset:compute-time',amount:rational(1000),from_ref:'F'};
  fTerms.policy={...terms.policy,name:'F-requires-energy',clauses:[{kind:'resource',collector:signer(native),replayer:signer(r),metric:'energy_watt_hours_observed',minimum:rational(1),maximum:null,allowed_capture_modes:['signed-meter-ingest/v1'],allowed_reading_origins:['device-telemetry/v1']}]};
  const fOffer=await publishOffer(fTerms,F,'world:market-unit:F',at(0)),fDoor=await publishDoor(fOffer,'https://f.example/cross','market-unit',F,'world:market-unit:F',at(1));
  const input={run_id:'market-unit',descriptor,evidence,doors:[door,eDoor,fDoor],expected_offerers:[signer(offer),signer(eOffer),signer(fOffer)],observed_at:at(4)};
  const discovery=await discover(input);return {A,B,E,F,G,adapter,world,terms,offer,door,eDoor,fDoor,evidence,descriptor,input,discovery};
}

describe('Door discovery and sovereign choice',()=>{
  let s:Awaited<ReturnType<typeof setup>>;before(async()=>{s=await setup();});
  test('concurrent local actions expose one complete immutable JSON value to polling readers',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'relatte-door-publication-')),path=join(dir,'crossing.json'),padding='evidence'.repeat(131072);
    let finished=false,observations=0;
    const reader=(async()=>{while(!finished){try{const v=JSON.parse(await readFile(path,'utf8'));assert.equal(v.padding,padding);assert.ok(Number.isInteger(v.writer)&&v.writer>=0&&v.writer<12);observations++;}catch(error:any){if(error.code!=='ENOENT')throw error;}await new Promise<void>(yes=>setImmediate(yes));}})();
    try {
      const results=await Promise.allSettled(Array.from({length:12},(_,writer)=>atomicExclusive(path,{writer,padding})));
      const deadline=Date.now()+5000;while(observations===0&&Date.now()<deadline)await new Promise<void>(yes=>setImmediate(yes));assert.ok(observations>0);
      finished=true;await reader;assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      for(const r of results)if(r.status==='rejected')assert.equal(r.reason.code,'EEXIST');
      const retained=await readFile(path,'utf8');assert.equal(JSON.parse(retained).padding,padding);
      await assert.rejects(atomicExclusive(path,{replacement:true}),{code:'EEXIST'});assert.equal(await readFile(path,'utf8'),retained);
    }finally{finished=true;await reader;await rm(dir,{recursive:true,force:true});}
  });
  test('independent policies yield compatible credits/storage and missing compute evidence without ranking or automatic choice',async()=>{
    const d=await verifyDiscovery(s.discovery);assert.equal(d.rows.find(r=>r.offerer.world_id.endsWith(':B'))!.compatibility,'appears-compatible');
    assert.equal(d.rows.find(r=>r.offerer.world_id.endsWith(':E'))!.compatibility,'appears-compatible');assert.equal(d.rows.find(r=>r.offerer.world_id.endsWith(':F'))!.compatibility,'missing-evidence');
    assert.equal(d.recommendation,null);assert.equal(d.selected_door_id,null);assert.equal(d.claims.automatic_crossing_performed,false);assert.equal(d.claims.ranking_asserted,false);
    assert.deepEqual(new Set(d.rows.map(r=>r.transfer_terms.unit)),new Set(['local-credit','byte-window','millisecond']));
    const reversed=await discover({...s.input,doors:[...s.input.doors].reverse()});assert.deepEqual(reversed.rows,d.rows);
  });
  test('local directories can omit compatible doors or duplicate them without asserting complete market state',async()=>{
    const partial=await discover({...s.input,doors:[s.fDoor,s.door]}),duplicates=await discover({...s.input,doors:[s.door,s.door,s.eDoor,s.fDoor]});
    assert.notEqual(partial.discovery_id,s.discovery.discovery_id);assert.equal(partial.rows.length,2);assert.equal(partial.claims.directory_complete,false);
    assert.equal(duplicates.rows.length,3);assert.deepEqual(duplicates.duplicate_door_ids,[s.door.advertisement.crossing_id]);
  });
  test('G can sign an empty local listing without a global no-offer inference; foreign listing identities reject',async()=>{
    const g={world_id:'world:market-unit:G',public_key:s.G.publicKeyJwk},l=await publishListing([],'market-unit',s.G,g.world_id,at(4));
    assert.equal((await inspectListing(l,'market-unit',g)).doors.length,0);assert.equal(l.listing.extensions.organ_adapter.donor_claims.claims.directory_complete,false);
    await assert.rejects(inspectListing(l,'market-unit',signer(s.offer)),/IDENTITY/);
    await assert.rejects(publishListing([s.door],'market-unit',s.G,g.world_id,at(4)),/IDENTITY/);
  });
  test('untrusted keys, substituted offers, tampered routes and other runs remain rejected sources',async()=>{
    const changed=structuredClone(s.door);changed.advertisement.extensions.organ_adapter.donor_claims.crossing_endpoint='https://elsewhere.example';
    const switched={...s.door,offer:s.eDoor.offer};await assert.rejects(inspectDoor(switched,'market-unit'),/OFFERER/);
    await assert.rejects(inspectDoor(s.door,'other-run'),/RUN/);await assert.rejects(publishDoor(s.offer,'javascript:alert(1)','market-unit',s.B,signer(s.offer).world_id,at(5)),/ENDPOINT/);
    const d=await discover({...s.input,doors:[changed,s.door],expected_offerers:[signer(s.eDoor.offer)]});assert.equal(d.rows.length,0);assert.equal(d.rejected_sources.length,2);
  });
  test('descriptor identity/inventory binds exact evidence; report hashes cannot promote a hint into selection',async()=>{
    await assert.rejects(publishDescriptor(s.evidence,'market-unit',s.B,s.world,at(3)),/PRODUCER/);
    const altered=structuredClone(s.evidence);altered.audit=null;await assert.rejects(inspectDescriptor(s.descriptor,altered,'market-unit'));
    const d=structuredClone(s.discovery);d.selected_door_id=s.door.advertisement.crossing_id;const {discovery_id:_,...body}=d;
    d.discovery_id='useful-work-door-discovery-v1:'+domainHash('useful-work-door-discovery-v1|',body);await assert.rejects(verifyDiscovery(d),/REPLAY/);
  });
  test('only A can sign a choice for its exact observed descriptor, evidence, door and query; choice alone creates no crossing',async()=>{
    await assert.rejects(chooseDoor(s.discovery,s.door.advertisement.crossing_id,'Impersonation',s.B,s.world,at(5)),/SOVEREIGN/);
    await assert.rejects(chooseDoor(s.discovery,'unobserved-door','Not in my view',s.A,s.world,at(5)),/NOT_OBSERVED/);
    const choice=await chooseDoor(s.discovery,s.door.advertisement.crossing_id,'I prefer this specific local-credit door.',s.A,s.world,at(5));
    const c=await inspectChoice(choice,s.discovery);assert.equal(c.choice.extensions.organ_adapter.donor_claims.claims.automatic_crossing_performed,false);
    assert.equal(c.choice.extensions.organ_adapter.donor_claims.local_choice_issued,true);
    await assert.rejects(inspectChoice(choice,await discover({...s.input,doors:[s.door]})),/REFERENCE/);
    await assert.rejects(crossChosenDoor(null,s.discovery,s.A,s.world,at(6)));await assert.rejects(crossChosenDoor(choice,s.discovery,s.B,s.world,at(6)),/PRESENTER/);
  });
  test('crossing requires a second explicit action and still permits a policy-PASS offerer to HOLD',async()=>{
    const choice=await chooseDoor(s.discovery,s.door.advertisement.crossing_id,'My local choice.',s.A,s.world,at(5));
    const crossing=await crossChosenDoor(choice,s.discovery,s.A,s.world,at(6));await inspectDoorCrossing(crossing,s.discovery);
    const decision=await decide(crossing.offer,crossing.evidence,crossing.presentation,'HOLD',at(7),'My local discretion despite compatible evidence.',s.B,signer(s.offer).world_id,at(8));
    const e=await verifyExchange({schema:'useful-work.offer-exchange/v1',offer:crossing.offer,evidence:crossing.evidence,presentation:crossing.presentation,decision});
    assert.equal(e.report.policy_evaluation.status,'PASS');assert.equal(e.report.choice,'HOLD');assert.equal(e.report.claims.credit_ledger_changed,false);
    await assert.rejects(inspectDoorCrossing({...crossing,offer:s.eDoor.offer},s.discovery),/SCOPE/);
  });
  test('a discovery-time match does not survive an expired cutoff as ACCEPT',async()=>{
    const choice=await chooseDoor(s.discovery,s.door.advertisement.crossing_id,'Choose now.',s.A,s.world,at(5)),crossing=await crossChosenDoor(choice,s.discovery,s.A,s.world,at(100));
    await assert.rejects(decide(crossing.offer,crossing.evidence,crossing.presentation,'ACCEPT',at(100),'Late.',s.B,signer(s.offer).world_id,at(101)),/LOCAL_CONDITIONS/);
    const d=await discover({...s.input,observed_at:at(100)});assert.equal(d.rows.find(r=>r.door_id===s.door.advertisement.crossing_id)!.compatibility,'local-condition-mismatch');
  });
  test('A may choose a negative hint, but the offerer cannot ACCEPT missing energy or manufacture a transfer',async()=>{
    const choice=await chooseDoor(s.discovery,s.fDoor.advertisement.crossing_id,'I choose to ask F despite missing evidence.',s.A,s.world,at(5));
    const c=await crossChosenDoor(choice,s.discovery,s.A,s.world,at(6));await inspectDoorCrossing(c,s.discovery);
    await assert.rejects(decide(c.offer,c.evidence,c.presentation,'ACCEPT',at(7),'Cannot upgrade missing energy.',s.F,signer(s.fDoor.offer).world_id,at(8)),/LOCAL_CONDITIONS/);
  });
});

async function command(args:string[],cwd=repo) {return new Promise<{code:number|null;stdout:string;stderr:string}>((yes,no)=>{
  const p=spawn(process.execPath,['--experimental-strip-types',...args],{cwd,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.once('error',no);p.once('close',code=>yes({code,stdout,stderr}));
});}
describe('Field Test 003 — The Door Market live composition',{skip:process.platform!=='linux'},()=>{
  let dir:string,out:string,view:Wire;
  before(async()=>{
    dir=await mkdtemp(join(tmpdir(),'relatte-door-market-'));out=join(dir,'run');
    const p=spawn(process.execPath,['--experimental-strip-types','src/useful_work/cli_field_003.ts','run','examples/useful-work-001/julia-001.json',out],{cwd:repo,stdio:['ignore','pipe','pipe']});
    let log='',stderr='',waitingResolve:()=>void,waitingReject:(e:Error)=>void;
    const waiting=new Promise<void>((yes,no)=>{waitingResolve=yes;waitingReject=no;});
    p.stdout.on('data',b=>{log+=b;if(log.includes('DOOR_MARKET_WAITING '))waitingResolve();});p.stderr.on('data',b=>stderr+=b);
    const completed=new Promise<number|null>((yes,no)=>{p.once('error',no);p.once('close',code=>{waitingReject(new Error('Run ended before discovery: '+log+stderr));yes(code);});});
    const timer=setTimeout(()=>{p.kill('SIGTERM');waitingReject(new Error('DOOR_MARKET_LIVE_TIMEOUT '+log+stderr));},260000);
    try {
      await waiting;const aRoot=join(out,'trade/A'),market=join(aRoot,'market'),discovery=JSON.parse(await readFile(join(market,'discovery.json'),'utf8'));
      const ledger=async()=>JSON.parse(await readFile(join(out,'trade/adapter/ledger/state.json'),'utf8'));
      await new Promise(yes=>setTimeout(yes,1500));assert.equal(Object.keys((await ledger()).entries).length,0);
      await assert.rejects(readFile(join(market,'choice.json')),{code:'ENOENT'});await assert.rejects(readFile(join(market,'crossing.json')),{code:'ENOENT'});
      const b=discovery.rows.find((r:Wire)=>r.offerer.world_id.endsWith(':B'));
      const chosen=await command(['src/useful_work/cli_field_003.ts','choose',aRoot,discovery.discovery_id,b.door_id,'Test operator explicitly chooses B credits; no system recommendation.']);assert.equal(chosen.code,0,chosen.stderr);
      await new Promise(yes=>setTimeout(yes,1500));assert.equal(Object.keys((await ledger()).entries).length,0);await assert.rejects(readFile(join(market,'crossing.json')),{code:'ENOENT'});
      const choice=JSON.parse(await readFile(join(market,'choice.json'),'utf8'));
      const crossed=await command(['src/useful_work/cli_field_003.ts','cross',aRoot,discovery.discovery_id,choice.crossing_id]);assert.equal(crossed.code,0,crossed.stderr);
      const repeated=await command(['src/useful_work/cli_field_003.ts','cross',aRoot,discovery.discovery_id,choice.crossing_id]);assert.notEqual(repeated.code,0);
      assert.equal(await completed,0,log+stderr);view=JSON.parse(await readFile(join(market,'public-local-view.json'),'utf8'));
    }finally{clearTimeout(timer);if(p.exitCode===null)p.kill('SIGTERM');}
  },{timeout:280000});
  after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
  test('B and E appear compatible; F lacks energy; G publishes no local offer; A explicitly chooses only B',async()=>{
    const v=await verifyMarketView(view),s=v.view.summary,byRole=(r:string)=>s.discovered_doors.find((d:Wire)=>d.offerer.world_id.endsWith(':'+r))!;
    assert.equal(byRole('B').compatibility,'appears-compatible');assert.equal(byRole('E').compatibility,'appears-compatible');assert.equal(byRole('F').compatibility,'missing-evidence');
    assert.equal(s.locally_empty_listings.length,1);assert.ok(s.locally_empty_listings[0].world_id.endsWith(':G'));assert.equal(s.global_absence_inferred,false);assert.equal(s.discovery_views_differ,true);
    assert.ok(s.chosen_offerer.world_id.endsWith(':B'));assert.equal(s.acceptance.choice,'ACCEPT');assert.deepEqual(s.acceptance.B_value,rational(12));assert.deepEqual(s.dissent.amount,rational(5));
    assert.equal(s.settlement.credit_ledger_changed,true);assert.equal(s.claims.capacity_verified,false);assert.equal(s.claims.universal_price_asserted,false);
  });
  test('exactly one external debit occurs; original contradiction, expired slot and late HOLD remain independent',async()=>{
    const ledger=JSON.parse(await readFile(join(out,'trade/adapter/ledger/state.json'),'utf8'));assert.deepEqual(ledger.balances,{A:'12',B:'88'});assert.equal(Object.keys(ledger.entries).length,1);
    const d=view.view.wire_view.view.summary.domain;assert.equal(d.acceptance.contradiction_count,1);assert.deepEqual(d.acceptance.expired_service_slots,[1]);assert.equal(d.late_evidence.choice,'HOLD');
  });
  test('rehashing cannot select E, promote F, erase a local source, or detach the choice from the actual crossing',async()=>{
    for(const mutate of [(v:Wire)=>v.summary.chosen_offerer=v.summary.discovered_doors.find((d:Wire)=>d.offerer.world_id.endsWith(':E')).offerer,
      (v:Wire)=>v.summary.discovered_doors.find((d:Wire)=>d.offerer.world_id.endsWith(':F')).compatibility='appears-compatible',
      (v:Wire)=>v.sources.pop(),(v:Wire)=>v.crossing.choice=v.discovery.input.descriptor]) {
      const d=structuredClone(view);mutate(d.view);const {view_id:_,...body}=d.view;d.view.view_id=marketViewId(body);await assert.rejects(verifyMarketView(d));
    }
  });
  test('one public A view replays after relocation without other world stores, private keys, actors or ledger programs',async()=>{
    const portable=join(dir,'portable');await cp(join(repo,'src'),join(portable,'src'),{recursive:true});await symlink(join(repo,'node_modules'),join(portable,'node_modules'),'dir');await writeFile(join(portable,'package.json'),'{"type":"module"}');await writeFile(join(portable,'view.json'),canonicalBytes(view));
    for(const path of ['resources/collectors.ts','algorithm.ts','worker.ts','merkle_native/worker.ts'])await rm(join(portable,'src/useful_work',path));
    const r=await command(['src/useful_work/cli_field_003.ts','verify','view.json'],portable);assert.equal(r.code,0,r.stderr);assert.equal(JSON.parse(r.stdout).view_id,view.view.view_id);
  });
});
