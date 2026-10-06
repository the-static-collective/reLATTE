import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocal } from '../useful-work-field-002/local.ts';
import { atomic, readJson } from '../../src/useful_work/wire_field/store.ts';
import { verifyMarketView } from '../../src/useful_work/door_market/archive.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';

async function freePort() {const s=createServer();await new Promise<void>(yes=>s.listen(0,'127.0.0.1',()=>yes()));const p=(s.address() as {port:number}).port;await new Promise<void>(yes=>s.close(()=>yes()));return p;}
/** Lifecycle only. This driver has no choice parameter and never signs a choice or crossing. */
export async function runMarket(job:Wire,out:string) {
  await mkdir(out);const children:ReturnType<typeof fork>[]=[];
  const stop=()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');};process.once('SIGTERM',stop);
  const ext=import.meta.url.endsWith('.js')?'js':'ts',cli=fileURLToPath(new URL(`../../src/useful_work/cli_field_003.${ext}`,import.meta.url));
  try {
    await runLocal(job,join(out,'trade'),{run_id:'field-wire-003',run_timeout_ms:300000,prepare:async(peers,upstreams)=>{
      const sources:Wire[]=[{role:'B',identity:peers.B.keys.primary,endpoint:upstreams.B+'/doors'}];
      for(const role of ['E','F','G']) {
        const root=join(out,role),port=await freePort(),config={role,root,port,peers,run_id:'door-market-003',present_before:new Date(Date.now()+300000).toISOString()};
        await atomic(join(root,'config.json'),config);const child=fork(cli,['provider',join(root,'config.json')],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--experimental-strip-types']});children.push(child);
        const card=await new Promise<Wire>((yes,no)=>{
          const timer=setTimeout(()=>{child.kill('SIGTERM');no(new Error('MARKET_PROVIDER_START_TIMEOUT'));},20000);
          child.once('error',e=>{clearTimeout(timer);no(e);});child.once('exit',code=>{clearTimeout(timer);no(new Error('MARKET_PROVIDER_EARLY_EXIT_'+code));});
          child.on('message',(m:Wire)=>{if(m.kind==='ready'){clearTimeout(timer);yes(m.card);}});
        });
        sources.push({role,identity:card.identity,endpoint:`http://127.0.0.1:${port}/doors`});
      }
      const door_market={run_id:'door-market-003',sources};
      return {A:{door_market},B:{door_market}};
    }});
    const view=await verifyMarketView(await readJson(join(out,'trade/A/market/public-local-view.json')));
    console.log(JSON.stringify({output:out,public_local_view:join(out,'trade/A/market/public-local-view.json'),chosen_door:view.view.summary.chosen_door_id,global_market_state:null}));
  } finally {process.off('SIGTERM',stop);stop();await Promise.all(children.map(child=>child.exitCode===null?new Promise<void>(yes=>child.once('exit',()=>yes())):Promise.resolve()));}
}
