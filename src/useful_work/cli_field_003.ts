import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedRead, now, readWorkerKeys } from './cli_io.ts';
import { equal } from './audit_clock/wire.ts';
import { signer } from './settlement/wire.ts';
import { atomicExclusive, readJson } from './wire_field/store.ts';
import { chooseDoor, crossChosenDoor, discover, inspectChoice, verifyDiscovery } from './door_market/model.ts';
import { verifyMarketView } from './door_market/archive.ts';

const assert=(v:unknown,message:string)=>{if(!v)throw new Error(message);};
async function main(args:string[]) {
  const command=args.shift();
  if(command==='run') {assert(args.length===2,'Usage: run <job.json> <new-output-directory>');const {runMarket}=await import('../../examples/useful-work-field-003/run.ts');await runMarket(await readJson(args[0]),resolve(args[1]));return;}
  if(command==='provider') {assert(args.length===1,'Usage: provider <local-config.json>');await(await import('../../examples/useful-work-field-003/provider.ts')).serveProvider(await readJson(args[0]));return;}
  if(command==='discover') {assert(args.length===1,'Usage: discover <discovery-input.json>');console.log(JSON.stringify(await discover(JSON.parse((await boundedRead(args[0],32*1024*1024)).toString('utf8'))),null,2));return;}
  if(command==='choose'||command==='cross') {
    const root=resolve(args[0]??''),path=join(root,'market'),d=await verifyDiscovery(await readJson(join(path,'discovery.json'))),config=await readJson(join(root,'config.json'));
    assert(args[1]===d.discovery_id,'MARKET_OPERATOR_DISCOVERY_ID_MISMATCH');
    const keys=await readWorkerKeys(join(root,'state/primary.json'));
    assert(config.role==='A'&&equal(keys.publicKeyJwk,signer(d.input.descriptor).public_key),'MARKET_OPERATOR_LOCAL_WORLD_MISMATCH');
    if(command==='choose') {
      assert(args.length===4,'Usage: choose <A-local-root> <exact-discovery-id> <exact-door-id> <local-reason>');
      const choice=await chooseDoor(d,args[2],args[3],keys,config.peers.A.world_id,now());await atomicExclusive(join(path,'choice.json'),choice);
      console.log(JSON.stringify({choice_id:choice.crossing_id,crossing_performed:false,acceptance_observed:false}));return;
    }
    assert(args.length===3,'Usage: cross <A-local-root> <exact-discovery-id> <exact-choice-id>');
    const c=await inspectChoice(await readJson(join(path,'choice.json')),d);assert(c.choice.crossing_id===args[2],'MARKET_OPERATOR_CHOICE_ID_MISMATCH');
    assert(equal(c.door.offer.offerer,config.peers.B.keys.primary),'FIELD_003_WIRE_ADAPTER_CONFIGURED_FOR_B_DOOR_ONLY');
    assert(c.door.crossing_endpoint===config.endpoints.B+'/wire','FIELD_003_DOOR_ROUTE_NOT_CONFIGURED');
    const crossing=await crossChosenDoor(c.choice,d,keys,config.peers.A.world_id,now());await atomicExclusive(join(path,'crossing.json'),crossing);
    console.log(JSON.stringify({intent_id:crossing.intent.crossing_id,presentation_id:crossing.presentation.crossing_id,acceptance_observed:false,transfer_performed:false}));return;
  }
  if(command==='verify') {assert(args.length===1,'Usage: verify <public-local-view.json>');const v=await verifyMarketView(JSON.parse((await boundedRead(args[0],64*1024*1024)).toString('utf8')));console.log(JSON.stringify({view_id:v.view.view_id,summary:v.view.summary},null,2));return;}
  throw new Error('Usage: useful-work-field-003 run | discover | choose | cross | verify');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
