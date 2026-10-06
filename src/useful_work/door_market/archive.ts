import { sealOpaqueOrganCrossing } from '../../organ.ts';
import { verifyCrossingEnvelope } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { equal, expectedCrossingId, instant } from '../audit_clock/wire.ts';
import { signer } from '../settlement/wire.ts';
import type { Wire } from '../settlement/wire.ts';
import { verifyLocalView } from '../wire_field/replay.ts';
import { inspectDoorCrossing, inspectListing, MARKET_CONTRACT, MARKET_LAWS, MARKET_LIMITS, verifyDiscovery } from './model.ts';

export interface MarketViewInput { wire_view: Wire; discovery: Wire; narrow_discovery: Wire; sources: Wire[]; crossing: Wire }
function assert(condition:unknown,error:string): asserts condition {if(!condition)throw new Error(error);}
export const marketViewId=(body:unknown)=>'useful-work-door-local-view-v1:'+domainHash('DoorMarket-LocalView-v1|',body);
export async function createMarketView(value: MarketViewInput) {
  assert(canonicalBytes(value).length<=64*1024*1024,'MARKET_VIEW_LIMIT');
  const input=structuredClone(record(value,'INVALID_MARKET_VIEW_INPUT')) as MarketViewInput;
  exactKeys(input,['wire_view','discovery','narrow_discovery','sources','crossing'],'INVALID_MARKET_VIEW_INPUT');
  const w=await verifyLocalView(input.wire_view),d=await verifyDiscovery(input.discovery),n=await verifyDiscovery(input.narrow_discovery),c=await inspectDoorCrossing(input.crossing,d);
  assert(w.view.role==='A'&&equal(signer(d.input.descriptor),w.view.peers.A.keys.primary),'MARKET_VIEW_PRESENTER_MISMATCH');
  assert(d.input.run_id==='door-market-003'&&w.view.run_id==='field-wire-003','MARKET_VIEW_RUN_MISMATCH');
  assert(equal(n.input.descriptor,d.input.descriptor)&&equal(n.input.evidence,d.input.evidence)&&equal(n.input.expected_offerers,d.input.expected_offerers),'MARKET_QUERY_SCOPE_MISMATCH');
  assert(n.input.doors.every((door:unknown)=>d.input.doors.some((other:unknown)=>equal(door,other))),'MARKET_QUERY_NOT_LOCAL_SUBSET');
  assert(Array.isArray(input.sources)&&input.sources.length<=16,'MARKET_VIEW_SOURCE_LIMIT');const doors:Wire[]=[],empty:Wire[]=[];
  assert(input.sources.length===d.input.expected_offerers.length,'MARKET_VIEW_SOURCE_PINS_MISMATCH');
  for(const [i,s] of input.sources.entries()) {
    assert(equal(s.identity,d.input.expected_offerers[i]),'MARKET_VIEW_SOURCE_PINS_MISMATCH');instant(s.observed_at);
    if(s.listing!==null) {const l=await inspectListing(s.listing,d.input.run_id,s.identity);doors.push(...l.doors);if(!l.doors.length)empty.push(s.identity);}
    else assert(typeof s.error==='string'&&s.error.length>0,'MARKET_VIEW_FAILURE_OBSERVATION_REQUIRED');
  }
  assert(equal(doors,d.input.doors),'MARKET_VIEW_DISCOVERY_INVENTORY_MISMATCH');
  const outgoing=w.view.messages.find((m:Wire)=>m.crossing.extensions.organ_adapter.donor_claims.topic==='presentation');
  assert(outgoing&&w.view.events.some((e:Wire)=>e.kind==='SEND_INTENT'&&e.message_id===outgoing.crossing.crossing_id),'MARKET_VIEW_PRESENTATION_NOT_OBSERVED');
  assert(equal(outgoing.body,{schema:'useful-work.field-presentation/v1',offer:c.offer,evidence:c.evidence,presentation:c.presentation}),'MARKET_VIEW_ACTUAL_CROSSING_MISMATCH');
  const acceptance=w.view.messages.find((m:Wire)=>m.crossing.extensions.organ_adapter.donor_claims.topic==='acceptance');
  assert(acceptance&&equal(acceptance.body.offer,c.offer)&&equal(acceptance.body.presentation,c.presentation),'MARKET_VIEW_ACCEPTANCE_SCOPE_MISMATCH');
  assert(w.view.summary.domain.acceptance&&w.view.summary.domain.settlement&&w.view.summary.domain.dissent,'MARKET_VIEW_TRADE_OBSERVATIONS_REQUIRED');
  const row=d.rows.find((r:Wire)=>r.door_id===c.choice.extensions.organ_adapter.donor_claims.door_id)!;
  const summary={run_id:d.input.run_id,local_world:w.view.peers.A.world_id,discovery_id:d.discovery_id,narrow_discovery_id:n.discovery_id,
    discovered_doors:d.rows.map((r:Wire)=>({door_id:r.door_id,offerer:r.offerer,compatibility:r.compatibility,transfer_terms:r.transfer_terms})),
    locally_empty_listings:empty,global_absence_inferred:false,discovery_views_differ:!equal(d.rows,n.rows),
    explicit_choice_id:c.choice.crossing_id,chosen_door_id:row.door_id,chosen_offerer:row.offerer,
    crossing_intent_id:c.intent.crossing_id,presentation_id:c.presentation.crossing_id,
    acceptance:w.view.summary.domain.acceptance,settlement:w.view.summary.domain.settlement,dissent:w.view.summary.domain.dissent,
    wire_local_view_id:w.view.view_id,claims:MARKET_LIMITS,laws:MARKET_LAWS};
  const body={schema:'useful-work.door-local-view/v1',...input,summary};return {...body,view_id:marketViewId(body)};
}
function spec(view:Wire,at:string) {
  instant(at);assert(instant(at)>=instant(view.wire_view.crossing.created_at),'MARKET_CUT_PRECEDES_WIRE_CUT');
  return {schema:'relatte.opaque-organ-spec/v0' as const,family_ref:'organ:useful-work/door-market-local-cut-v1',donor_contract_ref:MARKET_CONTRACT,
    artifact_kind:'door-market-local-history',source_world:view.summary.local_world,source_particular:'particular:door-market:local-preserver',source_history_head:null,
    payload_refs:[{address:view.view_id,role:'door-market-local-view',media_type:'application/json'}],
    donor_claims:{view_id:view.view_id,run_id:view.summary.run_id,local_only:true,global_history_complete:false,authority_asserted:false},
    requested_effect:{kind:'candidate-ingress',authority:'receiver-local'},return_address:null,created_at:at};
}
export async function sealMarketView(input: MarketViewInput,keys:P256KeyMaterial,at:string) {
  const view=await createMarketView(input);assert(equal(keys.publicKeyJwk,view.wire_view.view.peers.A.keys.primary.public_key),'MARKET_CUT_KEY_MISMATCH');
  return {schema:'useful-work.door-local-delivery/v1',view,crossing:await sealOpaqueOrganCrossing(spec(view,at),keys)};
}
export async function verifyMarketView(value:unknown) {
  assert(canonicalBytes(value).length<=64*1024*1024,'MARKET_VIEW_LIMIT');const v=record(value,'INVALID_MARKET_DELIVERY');
  exactKeys(v,['schema','view','crossing'],'INVALID_MARKET_DELIVERY');assert(v.schema==='useful-work.door-local-delivery/v1','INVALID_MARKET_DELIVERY');
  const {schema,summary,view_id,...input}=record(v.view,'INVALID_MARKET_VIEW');
  const rebuilt=await createMarketView(input as MarketViewInput);assert(equal(rebuilt,v.view),'MARKET_VIEW_REPLAY_MISMATCH');
  assert(await verifyCrossingEnvelope(v.crossing)&&equal(signer(v.crossing),rebuilt.wire_view.view.peers.A.keys.primary)&&
    v.crossing.crossing_id===expectedCrossingId(spec(rebuilt,v.crossing.created_at),signer(v.crossing).public_key),'MARKET_CUT_REFERENCE_MISMATCH');
  return {schema:v.schema,view:rebuilt,crossing:structuredClone(v.crossing)};
}
