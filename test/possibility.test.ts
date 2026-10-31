import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';
import type { EvidenceRoute } from '../src/evidence-transit.ts';
import {
  adaptGrOUsefulLater, adaptPossibilityToEvidence, matchesGrOUsefulLater,
  matchesPossibilityContent, possibilityContentRef, possibilitySignalId,
  sealPossibilitySignal, transportPossibilitySignal, validateGrOUsefulLater,
  validatePossibilitySignal,
} from '../src/possibility.ts';
import type { PossibilitySignal } from '../src/possibility.ts';

const WHEN = '2026-10-31T23:00:00.000Z';
function card() {
  return {
    version: 'useful-later/001' as const,
    id: 'UL-12345678-1234-1234-1234-123456789abc',
    events: [{
      type: 'CREATED', actor: 'Sally', maker: 'Sally',
      work: 'Repair a neighborhood bicycle', minutes: 20, advance: 5,
      due: '2026-11-01', boundaries: 'No dangerous work', at: WHEN,
    }] as Record<string,unknown>[],
  };
}
function withEvent(c: ReturnType<typeof card>, type: string, actor: string,
  extra: Record<string,unknown> = {}) {
  return { ...c, events: [...c.events, {type, actor, ...extra, at: WHEN}] };
}
function source() { return {world:'world:gro-device-a',particular:'particular:maker-opaque'}; }
function generic(): PossibilitySignal {
  return {
    schema: 'relatte.possibility-signal/v0',
    source_system:'community.garden',
    source_world:'world:local-garden',
    source_particular:'particular:steward',
    source_event_id:'event:offered-002',
    relation_ref:'relation:seed-123',
    kind:'resource',
    action:'offered',
    content_ref: possibilityContentRef({resource:'surplus garden seeds',qty:3}),
    occurred_at: WHEN, claim_level:'source_claim', scope:'review_only',
  };
}
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-possibility-'));
  const receiver = await LocalReceiver.create(join(dir,'owner'), {
    world_id:'world:recipient-local', receiver_particular:'particular:review-desk',
    contract_ref:'contract:owner-candidate-review/v0',
  });
  const source_keys = await generateP256KeyPair();
  const seen = new Set<string>();
  const route: EvidenceRoute = {
    destination:'review:community-candidate-inbox',capability_ref:null,
    source_keys, receiver, received_at:()=>WHEN,
  };
  return {dir,route,seen};
}
test('GrO source emits stable opaque signal; no names, work terms, or prices leak into signed crossing', async()=>{
  const c=card(), s=adaptGrOUsefulLater(c,source());
  assert.equal(s.action,'created');
  assert.equal(s.claim_level,'source_claim');
  assert.equal(matchesGrOUsefulLater(s,c),true);
  assert.equal(possibilitySignalId(s),possibilitySignalId(adaptGrOUsefulLater(c,source())));
  const {dir,route}=await setup();
  try {
    const crossed=await sealPossibilitySignal(s,route.destination,route.source_keys);
    assert.equal(await verifyCrossingEnvelope(crossed),true);
    const str=JSON.stringify(crossed);
    for(const confidential of ['Sally','Repair a neighborhood bicycle','No dangerous work','2026-11-01','\"advance\":5']) {
      assert.equal(str.includes(confidential),false,confidential);
    }
    assert.equal(crossed.declared_kind,'EVIDENCE_OBSERVATION');
    assert.equal(crossed.extensions.evidence_transit.evidence_level,'claim');
    assert.equal(adaptPossibilityToEvidence(s).assertion_kind,'possibility.service.created');
    assert.equal(await verifyCrossingEnvelope({...crossed,requested_effect:{kind:'settle-credit'}}),false);
    assert.equal(matchesGrOUsefulLater(s,{...c,events:[{...c.events[0],work:'Altered term'}]}),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('independent receiver defaults to signed HOLD; no local storage or human completion claimed',async()=>{
  const {dir,route}=await setup();
  try {
    const result=await transportPossibilitySignal(adaptGrOUsefulLater(card(),source()),route);
    assert.equal(result.status,'HELD');
    assert.equal(route.receiver.snapshot().admitted.length,0);
    assert.equal(await verifyReceipt(route.receiver.getReceiveReceipt(result.crossing_id)),true);
    assert.equal(await verifyReceipt(route.receiver.getDispositionReceipt(result.crossing_id)),true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('general signal accommodates other categories without imposing credit, money or service types',async()=>{
  const {dir,route,seen}=await setup();
  try {
    const s=generic(); validatePossibilitySignal(s);
    assert.equal(matchesPossibilityContent(s,{resource:'surplus garden seeds',qty:3}),true);
    assert.equal(matchesPossibilityContent(s,{resource:'surplus garden seeds',qty:4}),false);
    route.evaluate=async()=>({disposition:'ADMIT',reason:'local owner accepts review claim only'});
    route.store=async(_event,ctx)=>{const before=seen.has(ctx.event_id);seen.add(ctx.event_id);return {status:before?'already-stored':'stored'};};
    const a=await transportPossibilitySignal(s,route);
    assert.equal(a.status,'STORED');
    assert.equal(seen.size,1);
    assert.equal(route.receiver.snapshot().admitted.length,1);
    const count=route.receiver.journalLength();
    route.receiver=await LocalReceiver.open(join(dir,'owner'));
    const b=await transportPossibilitySignal(s,route);
    assert.equal(b.status,'ALREADY_STORED');
    assert.equal(b.crossing_id,a.crossing_id);
    assert.equal(route.receiver.journalLength(),count);
    route.evaluate=async()=>({disposition:'HOLD',reason:'owner withdrew permission'});
    assert.equal((await transportPossibilitySignal(s,route)).status,'BLOCKED');
    assert.equal(seen.size,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('receiver can refuse any claim without dispatch; no sink forces HOLD even on ADMIT policy',async()=>{
  const {dir,route,seen}=await setup();
  try {
    const s=generic();
    route.evaluate=async()=>({disposition:'ADMIT',reason:'pretend approved'});
    assert.equal((await transportPossibilitySignal(s,route)).status,'HELD');
    const next={...s,action:'cancelled'};
    route.evaluate=async()=>({disposition:'REFUSE',reason:'outside local policy'});
    route.store=async(_e,ctx)=>{seen.add(ctx.event_id);return {status:'stored'};};
    assert.equal((await transportPossibilitySignal(next,route)).status,'REFUSED');
    assert.equal(seen.size,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('GrO transfer needs proposal, maker approval and recipient acceptance; only source claims',()=>{
  const a=card();
  const b=withEvent(a,'ADVANCE_OFFERED','Bob',{holder:'Bob'});
  const c=withEvent(b,'ADVANCE_RECEIVED','Sally');
  const d=withEvent(c,'TRANSFER_REQUESTED','Bob',{to:'Claire'});
  const e=withEvent(d,'TRANSFER_APPROVED','Sally');
  const f=withEvent(e,'TRANSFER_ACCEPTED','Claire');
  const g=withEvent(f,'WORK_REPORTED','Sally');
  const h=withEvent(g,'WORK_CONFIRMED','Claire');
  for (const x of [a,b,c,d,e,f,g,h]) validateGrOUsefulLater(x);
  assert.equal(adaptGrOUsefulLater(h,source()).action,'work.confirmed');
  assert.notEqual(possibilitySignalId(adaptGrOUsefulLater(c,source())),possibilitySignalId(adaptGrOUsefulLater(h,source())));
  assert.throws(()=>validateGrOUsefulLater(withEvent(d,'TRANSFER_ACCEPTED','Claire')),/APPROVAL/);
  assert.throws(()=>validateGrOUsefulLater(withEvent(e,'TRANSFER_ACCEPTED','Bob')),/ACCEPTANCE/);
  assert.throws(()=>validateGrOUsefulLater(withEvent(g,'WORK_CONFIRMED','Bob')),/CONFIRM/);
  assert.throws(()=>validateGrOUsefulLater({...h,events:[...h.events,{type:'RELEASED',actor:'Claire',at:WHEN}]}),/CLOSED/);
});
test('malicious metadata cannot smuggle people, authority, unsupported classes or plain URLs',()=>{
  const s=generic();
  const bad=[
    {...s,relation_ref:'somebody@example.org'},
    {...s,source_world:'Mary Smith'},
    {...s,content_ref:'https://example.org/private'},
    {...s,scope:'public_authoritative'},
    {...s,claim_level:'verified'},
    {...s,amount:999},
    {...s,action:'credit paid!!!'},
    {...s,source_event_id:'event:abc\ncontact'},
  ];
  bad.forEach(v=>assert.throws(()=>validatePossibilitySignal(v)));
  const c=card();
  assert.throws(()=>validateGrOUsefulLater({...c,events:[{...c.events[0],advance:200}]}),/CREATED/);
  assert.throws(()=>validateGrOUsefulLater({...c,events:[{...c.events[0],type:'WORK_CONFIRMED'}]}),/CLOSED/);
});
