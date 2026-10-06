import { createServer } from 'node:http';
import { join } from 'node:path';
import { generateP256KeyPair } from '../../src/protocol.ts';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { now } from '../../src/useful_work/cli_io.ts';
import { atomic, readJson } from '../../src/useful_work/wire_field/store.ts';
import { rational } from '../../src/useful_work/valuation/rational.ts';
import { publishOffer } from '../../src/useful_work/settlement/exchange.ts';
import type { OfferTerms } from '../../src/useful_work/settlement/exchange.ts';
import type { Clause } from '../../src/useful_work/settlement/policy.ts';
import { publishDoor, publishListing } from '../../src/useful_work/door_market/model.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';

/** Each process owns its publication and key. It exposes no matching or transfer endpoint. */
export async function serveProvider(config:Wire) {
  const {role,root,port,peers,run_id}=config;if(!['E','F','G'].includes(role))throw new Error('INVALID_MARKET_PROVIDER_ROLE');
  const keys=await generateP256KeyPair(),world=`world:field-003:${role}`,identity={world_id:world,public_key:keys.publicKeyJwk};
  await atomic(join(root,'state/primary.json'),await crypto.subtle.exportKey('jwk',keys.privateKey));
  const card={schema:'useful-work.door-provider/v1',role,identity,process_id:process.pid,surface:'local process; shared host and OS user'};
  const doors:Wire[]=[];
  if(role!=='G') {
    const storage:Clause={kind:'resource',collector:peers.A.keys.primary,replayer:peers.C.keys.primary,metric:'logical_file_bytes_observed',
      minimum:rational(1),maximum:null,allowed_capture_modes:['live-local/v1'],allowed_reading_origins:[]};
    const energy:Clause={kind:'resource',collector:peers.A.keys.primary,replayer:peers.C.keys.primary,metric:'energy_watt_hours_observed',
      minimum:rational(1),maximum:null,allowed_capture_modes:['signed-meter-ingest/v1'],allowed_reading_origins:['device-telemetry/v1']};
    const service:Clause={kind:'service',observer:peers.B.keys.observer,host:peers.A.keys.primary,minimum_in_window_verified_slots:1};
    const terms:OfferTerms={description:role==='E'?'E offers a bounded storage service under its own evidence policy.':'F offers compute time under its own evidence policy, including a named energy observation.',
      transfer:{kind:'resource',system_ref:`external:field-003-${role}-resource-adapter`,asset_ref:role==='E'?'asset:storage-byte-window':'asset:compute-time',
        unit:role==='E'?'byte-window':'millisecond',amount:rational(role==='E'?1048576:1000),from_ref:`field-account:${role}`,to_ref:'field-account:A'},
      policy:{schema:'useful-work.acceptance-policy/v1',algorithm:'typed-evidence-all/v1',name:`field-${role}-local-policy`,clauses:role==='E'?[storage,service]:[energy]},
      present_before:config.present_before,eligible_presenter:peers.A.keys.primary,target:null,
      settlement_adapter:{identity:peers.adapter.keys.primary,allowed_record_origins:['operator-import/v1']}};
    const offer=await publishOffer(terms,keys,world,now());
    doors.push(await publishDoor(offer,`http://127.0.0.1:${port}/cross`,run_id,keys,world,now()));
  }
  const listing=await publishListing(doors,run_id,keys,world,now());
  await atomic(join(root,'public-card.json'),card);await atomic(join(root,'public-listing.json'),listing);
  const server=createServer((req,res)=>{
    if(req.method==='GET'&&req.url==='/doors'){res.writeHead(200,{'content-type':'application/json'}).end(canonicalBytes(listing));return;}
    res.writeHead(404).end(JSON.stringify({error:'This example publishes offers only; resource crossing adapters are not configured.'}));
  });
  await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',()=>yes());});
  process.send?.({kind:'ready',card});console.log(JSON.stringify({role,listing:join(root,'public-listing.json'),endpoint:`http://127.0.0.1:${port}/doors`}));
  await new Promise<void>(yes=>process.once('SIGTERM',()=>{server.close(()=>yes());server.closeAllConnections();}));
  if(process.connected)process.disconnect?.();
}
