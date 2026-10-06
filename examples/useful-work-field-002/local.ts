import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { actor } from './domain.ts';
import { faultProxy } from './fault_proxy.ts';
import { atomic, readJson } from '../../src/useful_work/wire_field/store.ts';
import { verifyLocalView } from '../../src/useful_work/wire_field/replay.ts';
import { WORLD_KEYS } from '../../src/useful_work/field_test/profile.ts';
import type { WorldRole } from '../../src/useful_work/field_test/profile.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';

async function port() {const server=createServer();await new Promise<void>(yes=>server.listen(0,'127.0.0.1',()=>yes()));const n=(server.address() as {port:number}).port;await new Promise<void>(yes=>server.close(()=>yes()));return n;}
/** Lifecycle and network exerciser only. World domain steps are entirely local. */
export interface LocalOptions { run_id?: string; run_timeout_ms?: number; prepare?: (peers:Wire,upstreams:Wire) => Promise<Record<string,Wire>> }
export async function runLocal(job_spec:Wire,out:string,options:LocalOptions={}) {
  await mkdir(out);const roles=Object.keys(WORLD_KEYS) as WorldRole[],peers:Wire={},upstreams:Wire={},roots:Wire={},ports:Wire={};
  for(const role of roles){const root=join(out,role);await mkdir(root,{mode:0o700});roots[role]=root;peers[role]=await actor('init',role,root,{},'init');ports[role]=await port();upstreams[role]=`http://127.0.0.1:${ports[role]}`;await atomic(join(root,'public-card.json'),peers[role]);}
  const proxyPort=await port(), endpoints=Object.fromEntries(roles.map(role=>[role,`http://127.0.0.1:${proxyPort}/${role}`]));
  await atomic(join(out,'peers.json'),peers);await atomic(join(out,'endpoints.json'),endpoints);
  const extra=options.prepare?await options.prepare(peers,upstreams):{},run_id=options.run_id??'field-wire-002';
  const proxy=await faultProxy({root:join(out,'network-exerciser'),run_id,port:proxyPort,upstreams,latency_ms:40,reorder_delay_ms:1500,partition_ms:4000,late_delay_ms:6000,timeout_ms:10000});
  const children:ReturnType<typeof spawn>[]=[],done:Promise<void>[]=[];
  const stop=()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');};process.once('SIGTERM',stop);
  const ext=import.meta.url.endsWith('.js')?'js':'ts',cli=fileURLToPath(new URL(`../../src/useful_work/cli_field_002.${ext}`,import.meta.url));
  try {
    for(const role of roles){
      const root=roots[role],config={run_id,role,root,bind_host:'127.0.0.1',port:ports[role],peers,endpoints,service_endpoint:endpoints.A+'/native',network_interface:'lo',
        issue_window_ms:20000,response_window_ms:10000,starts_after_ms:5000,retry_ms:300,timeout_ms:10000,unavailable_ms:45000,late_window_ms:3000,run_timeout_ms:options.run_timeout_ms??160000,
        surface:{surface_id:'same-host-process-'+role,description:'Local process test only; shared host, OS user and network namespace.',physical_machine_attested:false},job_spec,...extra[role]};
      await atomic(join(root,'config.json'),config);
      const child=spawn(process.execPath,['--experimental-strip-types',cli,'serve',join(root,'config.json')],{stdio:['ignore','pipe','pipe']});children.push(child);
      const logs:Buffer[]=[];child.stdout!.on('data',b=>{logs.push(Buffer.from(b));process.stdout.write(role+': '+b);});child.stderr!.on('data',b=>{logs.push(Buffer.from(b));process.stderr.write(role+': '+b);});
      done.push(new Promise<void>((yes,no)=>{child.once('error',no);child.once('close',async code=>{await atomic(join(root,'process-log.json'),{exit_code:code,log:Buffer.concat(logs).toString('utf8')});code===0?yes():no(new Error('WIRE_LOCAL_WORLD_FAILED: '+role));});}));
    }
    const settled=await Promise.allSettled(done);const failure=settled.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
    // Each view is replayed independently. This runner never constructs a merged history.
    for(const role of roles){const local=await readJson(join(roots[role],'public-local-view.json'));await verifyLocalView(local);}
    console.log(JSON.stringify({output:out,local_views:roles.map(role=>join(roots[role],'public-local-view.json')),global_view:null}));
  }finally{process.off('SIGTERM',stop);stop();await new Promise<void>(yes=>{proxy.server.close(()=>yes());proxy.server.closeAllConnections();});}
}
