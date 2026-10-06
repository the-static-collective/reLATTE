import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomic, Journal } from '../../src/useful_work/wire_field/store.ts';
import { MAX_WIRE_BYTES } from '../../src/useful_work/wire_field/message.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';

/** A network exerciser, with no world keys or domain command interface. */
export async function faultProxy(config: Wire) {
  const journal=new Journal(config.root,config.run_id,'network-exerciser'); await journal.load();
  const statePath=resolve(config.root,'fault-state.json'); let state:Wire={};
  try {state=JSON.parse(await readFile(statePath,'utf8'));} catch(error:any){if(error.code!=='ENOENT')throw error;}
  async function mark(label:string,value:unknown) {state[label]=value;await atomic(statePath,state);}
  const server=createServer(async(req,res)=>{
    const path=(req.url??'').split('/'),role=path[1],suffix='/'+path.slice(2).join('/');
    if(!config.upstreams[role] || !['/wire','/native'].includes(suffix) || req.method!=='POST'){res.writeHead(404).end();return;}
    let size=0;const chunks:Buffer[]=[];
    try {
      for await(const b of req){size+=b.length;if(size>MAX_WIRE_BYTES)throw new Error('FAULT_PROXY_SIZE_LIMIT');chunks.push(Buffer.from(b));}
      const bytes=Buffer.concat(chunks), packet=JSON.parse(bytes.toString('utf8')), m=packet.crossing?.extensions?.organ_adapter?.donor_claims;
      const topic=m?.topic??'native-service',from=m?.from??'observer';
      const detail={from,to:role,topic,bytes:bytes.length};
      await journal.append('HTTP_ATTEMPT',null,detail);
      // D's local process shutdown is exercised separately; this is a route partition.
      if(topic==='ledger-record' && role==='C') {
        if(!state.partition_started)await mark('partition_started',Date.now());
        if(Date.now()-state.partition_started<config.partition_ms){await journal.append('TEMPORARY_PARTITION',null,detail);res.destroy();return;}
      }
      const delay=topic==='late-presentation'?config.late_delay_ms:topic==='packet'&&role==='B'?config.reorder_delay_ms:config.latency_ms;
      if(delay>0){await journal.append(topic==='late-presentation'?'DELAY_LATE_EVIDENCE':topic==='packet'&&role==='B'?'DELAY_FOR_REORDER':'LATENCY',null,{...detail,delay_ms:delay});await new Promise(yes=>setTimeout(yes,delay));}
      const forward=async()=>{
        const reply=await fetch(config.upstreams[role]+suffix,{method:'POST',redirect:'error',signal:AbortSignal.timeout(config.timeout_ms??10000),headers:{'content-type':'application/json'},body:bytes});
        const body=Buffer.from(await reply.arrayBuffer());if(body.length>MAX_WIRE_BYTES)throw new Error('FAULT_PROXY_RESPONSE_LIMIT');return{status:reply.status,body};
      };
      const reply=await forward();
      if(topic==='packet'&&role==='C'&&!state.duplicated){await mark('duplicated',true);await forward();await journal.append('DUPLICATE_DELIVERY',null,detail);}
      if(topic==='acceptance'&&role==='adapter'&&!state.ack_lost){await mark('ack_lost',true);await journal.append('DISCONNECT_AFTER_FORWARD',null,detail);res.destroy();return;}
      await journal.append('HTTP_REPLY',null,{...detail,status:reply.status});res.writeHead(reply.status,{'content-type':'application/json'}).end(reply.body);
    }catch(error:any){await journal.append('CONNECTION_FAILURE',null,{to:role,error:String(error.message).slice(0,160)});if(!res.destroyed){res.writeHead(503).end();}}
  });
  await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(config.port,config.bind_host??'127.0.0.1',()=>yes());});
  return{server,journal};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=JSON.parse(await readFile(process.argv[2],'utf8'));const {server}=await faultProxy(config);
  console.log('Fault proxy listening:',config.port);process.on('SIGTERM',()=>{server.close();server.closeAllConnections();});
}
