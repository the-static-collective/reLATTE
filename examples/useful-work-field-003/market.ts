import { join } from 'node:path';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { createEvidence } from '../../src/useful_work/settlement/evidence.ts';
import type { EvidenceInput } from '../../src/useful_work/settlement/evidence.ts';
import { signer } from '../../src/useful_work/settlement/wire.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';
import { equal } from '../../src/useful_work/audit_clock/wire.ts';
import { discover, inspectChoice, inspectDoorCrossing, inspectListing, publishDescriptor } from '../../src/useful_work/door_market/model.ts';
import { sealMarketView } from '../../src/useful_work/door_market/archive.ts';
import { atomic, optional, readJson } from '../../src/useful_work/wire_field/store.ts';
import { now } from '../../src/useful_work/cli_io.ts';
import type { Peer } from '../useful-work-field-002/peer.ts';

async function fetchListing(source: Wire, run: string) {
  const response = await fetch(source.endpoint, {redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok) { await response.body?.cancel(); throw new Error('MARKET_LISTING_HTTP_'+response.status); }
  if (!response.body) throw new Error('MARKET_LISTING_BODY_REQUIRED');
  const reader=response.body.getReader(), chunks:Uint8Array[]=[];let size=0;
  try { while(true) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('MARKET_LISTING_SIZE_LIMIT');chunks.push(value); } }
  finally { await reader.cancel(); }
  return inspectListing(JSON.parse(Buffer.concat(chunks).toString('utf8')),run,source.identity);
}
/** Only A calls this hook. Discovery exposes no signing or remote command callback. */
export async function awaitMarketCrossing(peer: Peer, offer: Wire, input: Wire) {
  const root=join(peer.config.root,'market'), config=peer.config.door_market!;
  const evidence=await createEvidence(input as EvidenceInput);
  const descriptor=await peer.once('market-descriptor',()=>publishDescriptor(evidence,config.run_id,peer.keys,peer.config.peers.A.world_id,now()));
  let discovery=await optional(join(root,'discovery.json'));
  if (!discovery) {
    const sources=await Promise.all(config.sources.map(async(source:Wire)=>{
      try { const listing=await fetchListing(source,config.run_id);return {...source,observed_at:now(),listing}; }
      catch(error:any) { return {...source,observed_at:now(),listing:null,error:String(error.message).slice(0,160)}; }
    }));
    const doors=sources.flatMap((s:Wire)=>s.listing?.doors??[]);
    discovery=await discover({run_id:config.run_id,descriptor,evidence,doors,expected_offerers:config.sources.map((s:Wire)=>s.identity),observed_at:now()});
    await atomic(join(root,'sources.json'),sources);await atomic(join(root,'descriptor.json'),descriptor);await atomic(join(root,'discovery.json'),discovery);
    // A second local query omits E; it neither invalidates E's signed offer nor repairs the first query.
    const narrower=await discover({...discovery.input,doors:doors.filter((d:Wire)=>!equal(signer(d.offer),config.sources.find((s:Wire)=>s.role==='E').identity))});
    await atomic(join(root,'narrow-discovery.json'),narrower);
  }
  await atomic(join(root,'status.json'),{stage:'DISCOVERED',discovery_id:discovery.discovery_id,automatic_selection:false,automatic_crossing:false});
  console.log('DOOR_MARKET_WAITING '+JSON.stringify({root,discovery_id:discovery.discovery_id,doors:discovery.rows.map((r:Wire)=>({door_id:r.door_id,world:r.offerer.world_id,compatibility:r.compatibility}))}));
  let stopping=false;const stop=()=>{stopping=true;};process.once('SIGTERM',stop);
  const deadline=Date.now()+peer.config.run_timeout_ms;
  try {
    while(!stopping&&Date.now()<deadline) {
      const crossing=await optional(join(root,'crossing.json'));
      if(crossing) {
        const v=await inspectDoorCrossing(crossing,discovery);
        if(!equal(v.offer,offer))throw new Error('FIELD_003_WIRE_ADAPTER_CONFIGURED_FOR_B_DOOR_ONLY');
        const chosen=await inspectChoice(v.choice,discovery);
        if(chosen.door.crossing_endpoint!==peer.config.endpoints.B+'/wire')throw new Error('FIELD_003_DOOR_ROUTE_NOT_CONFIGURED');
        await atomic(join(root,'status.json'),{stage:'EXPLICIT_CROSSING',discovery_id:discovery.discovery_id,choice_id:v.choice.crossing_id,presentation_id:v.presentation.crossing_id});
        return {schema:'useful-work.field-presentation/v1',offer:v.offer,evidence:v.evidence,presentation:v.presentation};
      }
      await new Promise(yes=>setTimeout(yes,100));
    }
    throw new Error(stopping?'MARKET_LOCAL_OPERATOR_STOPPED':'MARKET_EXPLICIT_CROSSING_TIMEOUT');
  } finally {process.off('SIGTERM',stop);}
}
export async function preserveMarket(peer: Peer, wireView: Wire) {
  const root=join(peer.config.root,'market');
  const view=await sealMarketView({wire_view:wireView,discovery:await readJson(join(root,'discovery.json')),
    narrow_discovery:await readJson(join(root,'narrow-discovery.json')),sources:await readJson(join(root,'sources.json')),
    crossing:await readJson(join(root,'crossing.json'))},peer.keys,now());
  await atomic(join(root,'public-local-view.json'),view);
  console.log('DOOR_MARKET_LOCAL_RESULT '+JSON.stringify(view.view.summary));
}
