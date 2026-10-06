import { mkdir, readFile, unlink, open } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { networkInterfaces, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedRead, now, readWorkerKeys } from './cli_io.ts';
import { atomic, optional, readJson } from './wire_field/store.ts';
import { assert } from './wire_field/message.ts';
import { verifyLocalView } from './wire_field/replay.ts';
import { WORLD_KEYS } from './field_test/profile.ts';
import type { WorldRole } from './field_test/profile.ts';
import type { Wire } from './settlement/wire.ts';
import type { PeerConfig } from '../../examples/useful-work-field-002/peer.ts';

async function lock(root:string) {
  const path=join(root,'active-process.json');
  const start=async(pid:number)=>{const stat=await readFile(`/proc/${pid}/stat`,'utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];};
  const prior=await optional(path);
  if(prior){let alive=false;try{alive=(await start(prior.pid))===prior.start_ticks;}catch(error:any){if(error.code!=='ENOENT')throw error;}assert(!alive,'WIRE_WORLD_ALREADY_RUNNING');await unlink(path);}
  const fd=await open(path,'wx',0o600);try{await fd.writeFile(JSON.stringify({pid:process.pid,start_ticks:await start(process.pid)}));await fd.sync();}finally{await fd.close();}
  return async()=>unlink(path);
}
async function worker(config:Wire) {
  const root=resolve(config.root),release=await lock(root);
  const {Peer}=await import('../../examples/useful-work-field-002/peer.ts');
  const {Trade}=await import('../../examples/useful-work-field-002/domain.ts');
  const peer=new Peer({...config,root} as PeerConfig,await readWorkerKeys(join(root,'state/primary.json'))),trade=new Trade(peer);
  let interval:ReturnType<typeof setInterval>|undefined, code=0;
  try {
    await peer.load();await trade.initialize();await new Promise<void>((yes,no)=>{peer.server.once('error',no);peer.server.listen(config.port,config.bind_host,()=>yes());});
    const started=Date.now();let finishedAt:number|null=null, stopping=false;
    process.on('SIGTERM',()=>{stopping=true;});
    interval=setInterval(()=>{void peer.pump();void peer.flush();},100);
    while(!stopping && !peer.stopRequested) {
      if(Date.now()-started>config.run_timeout_ms){code=1;break;}
      if(peer.complete&&!peer.hasOutstanding()&&!peer.inFlight.size) {finishedAt??=Date.now();if(Date.now()-finishedAt>4000)break;}else finishedAt=null;
      await new Promise(yes=>setTimeout(yes,200));
    }
    if(stopping)code=130;else if(peer.stopRequested)code=75;
    if(interval)clearInterval(interval);
    await peer.quiesce();
    await peer.journal.append('STOP',null,{exit_code:code,locally_complete:peer.complete});
    await peer.export();await atomic(join(root,'status.json'),{role:peer.role,exit_code:code,locally_complete:peer.complete,last_event:peer.journal.events.at(-1)?.event_id});
    console.log(JSON.stringify({role:peer.role,exit_code:code,locally_complete:peer.complete,local_view:join(root,'public-local-view.json')}));
  }finally{if(interval)clearInterval(interval);await new Promise<void>(yes=>{peer.server.close(()=>yes());peer.server.closeAllConnections();});await release();}
  return code;
}
async function main(args:string[]) {
  const command=args.shift();
  if(command==='init') {
    const [roleText,rootText]=args,role=roleText as WorldRole,root=resolve(rootText??'');assert(Object.hasOwn(WORLD_KEYS,role)&&rootText&&args.length===2,'Usage: init <A|B|C|D|adapter> <new-local-root>');
    await mkdir(root,{recursive:true,mode:0o700});const {actor}=await import('../../examples/useful-work-field-002/domain.ts');
    const card=await actor('init',role,root,{},'init');await atomic(join(root,'public-card.json'),card);console.log(JSON.stringify(card));return;
  }
  if(command==='configure') {
    const [roleText,rootText,peersPath,endpointPath,jobPath,portText]=args;assert(args.length===6,'Usage: configure <role> <root> <peers.json> <endpoints.json> <job.json> <port>');
    const role=roleText as WorldRole,root=resolve(rootText),peers=await readJson(peersPath),endpoints=await readJson(endpointPath),job_spec=await readJson(jobPath);
    const names=Object.keys(networkInterfaces()),config={run_id:'field-wire-002',role,root,bind_host:'0.0.0.0',port:Number(portText),peers,endpoints,
      service_endpoint:endpoints.A+'/native',network_interface:names.find(n=>n!=='lo')??'lo',issue_window_ms:20000,response_window_ms:10000,starts_after_ms:5000,
      retry_ms:300,timeout_ms:10000,unavailable_ms:45000,late_window_ms:3000,run_timeout_ms:180000,
      surface:{surface_id:hostname(),description:'operator-declared execution surface',physical_machine_attested:false},job_spec};
    await atomic(join(root,'config.json'),config);return;
  }
  if(command==='verify') {
    const [input,out]=args;assert(input&&args.length<=2,'Usage: verify <local-view.json> [new-output.json]');
    const v=await verifyLocalView(JSON.parse((await boundedRead(resolve(input),64*1024*1024)).toString('utf8')));if(out)await atomic(resolve(out),v);
    console.log(JSON.stringify({role:v.view.role,view_id:v.view.view_id,summary:v.view.summary},null,2));return;
  }
  if(command==='worker') {process.exitCode=await worker(await readJson(args[0]));return;}
  if(command==='serve') {
    assert(args.length===1,'Usage: serve <local-config.json>');const path=resolve(args[0]),config=await readJson(path);
    // Each supervisor controls only its own world. No remote semantic commands are exposed.
    while(true) {
      const code=await new Promise<number>((yes,no)=>{
        const child=fork(fileURLToPath(import.meta.url),['worker',path],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--experimental-strip-types']});
        process.once('SIGTERM',()=>child.kill('SIGTERM'));child.once('error',no);child.once('close',code=>yes(code??1));
      });
      if(code!==75){process.exitCode=code;return;}
      const pause=await readJson(join(config.root,'unavailable-until.json'));
      while(Date.now()<Date.parse(pause.until))await new Promise(yes=>setTimeout(yes,500));
    }
  }
  if(command==='local') {
    const {runLocal}=await import('../../examples/useful-work-field-002/local.ts');assert(args.length===2,'Usage: local <job.json> <new-output-directory>');
    await runLocal(await readJson(args[0]),resolve(args[1]));return;
  }
  throw new Error('Usage: useful-work-field-002 init | configure | serve | verify | local');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
