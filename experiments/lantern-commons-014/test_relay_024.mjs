import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const html=fs.readFileSync(new URL('./Lantern_024_Live_Relay.html',import.meta.url),'utf8');
const API='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-relay-024';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.style={};this.value='';this.textContent='';this.checked=false;this.disabled=false;this.maxLength=500;}
 append(...xs){this.children.push(...xs);return this}
 replaceChildren(...xs){this.children=[...xs]}
 addEventListener(k,fn){this.events[k]=fn}
 setAttribute(k,v){this[k]=v}
 remove(){} after(){} scrollIntoView(){}
 click(){return this.events.click?.({preventDefault(){},target:this})}
}
function isolatedMain(){
 const elements=new Map(),storage=new Map(),download=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const d={getElementById:get,createElement:t=>new Element(t),createTextNode:t=>({textContent:String(t)}),body:new Element('body')};
 const box={document:d,window:null,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:webcrypto,Blob,Uint8Array,Date,JSON,Array,Object,String,Set,URL:{createObjectURL:()=>{download.push(true);return 'blob:test'},revokeObjectURL(){}},setTimeout:()=>{},console};
 box.window=box;get('kind').value='gather';get('cap-direction').value='offer';get('cap-category').value='food';
 const match=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(match);
 new vm.Script(match[1],{filename:'spawn-024-main.js'}).runInNewContext(box);
 return {get,api:box.SPAWN_024,download};
}
function cartridgeClient(markup,network=fetch){
 const match=markup.match(/<script>([\s\S]*?)<\/script>/);assert.ok(match);
 const elements=new Map(),downloads=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const document={getElementById:get,createElement:t=>new Element(t),body:new Element('body'),visibilityState:'visible'};
 const box={document,fetch:network,crypto:webcrypto,TextEncoder,Uint8Array,Blob,btoa,atob,Date,JSON,Array,Object,String,Set,
  URL:{createObjectURL:()=>{downloads.push(true);return 'blob:output'},revokeObjectURL(){}},setTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},console};
 new vm.Script(match[1],{filename:'spawn-024-cartridge.js'}).runInNewContext(box);
 return {get,crypto:box.RELATTE_CROSSING_023,relay:box.RELATTE_RELAY_024,downloads};
}
const http=async(action,data)=>{const res=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(16000)});return {status:res.status,result:await res.json()}};
test('024 main app exports opt-in relay world; no secret or inventory is exported',()=>{
 const b=isolatedMain();b.get('seed-three').click();
 const ps=b.api.state().projects;
 b.api.recordGlean(ps[0],{key:'writing'},'found','MY PRIVATE BOOKSHELF NOTES');
 const world=b.api.createWorldFamily(ps,'A reversible cooperative prototype',true).forks[0];
 const out=b.api.portableWorldHtml(world);
 assert.match(out,/SPAWN 024 · Live reLATTE Relay/);
 assert.match(out,/function worldRelayRuntime/);
 assert.match(out,/function worldCrossingRuntime/);
 assert.match(out,/SIGNATURE_MISMATCH/);
 assert.doesNotMatch(out,/MY PRIVATE BOOKSHELF NOTES/);
 assert.doesNotMatch(out,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.doesNotMatch(out,/<script[^>]+src=/i);
 assert.equal((out.match(/<script>/g)||[]).length,1);
 assert.equal((out.match(/<\/script>/g)||[]).length,1);
 const client=cartridgeClient(out,()=>{throw Error('fetch forbidden in setup')});
 assert.equal(client.relay.state().side,null);
 assert.equal(client.crypto.ledger().localOffer,null);
});
test('024 requires explicit consent and does not call server to list, publish or poll on page load',async()=>{
 const b=isolatedMain();b.get('seed-three').click();const w=b.api.createWorldFamily(b.api.state().projects,'A protocol without silent enrollment').forks[0];
 let requests=0;const client=cartridgeClient(b.api.portableWorldHtml(w),()=>{requests++;throw Error('test network disabled')});
 assert.equal(requests,0);
 await client.get('relay-publish').click();
 assert.equal(requests,0);
 assert.match(client.get('relay-status').textContent,/Explicit public-discovery consent/);
 await client.get('relay-send-interest').click();
 assert.equal(requests,0);
 assert.match(client.get('relay-status').textContent,/Explicit interest transmission consent/);
});
test('live API explicitly declares trust boundary, supports opt-in CORS and exposes only approved GET functions',async()=>{
 const a=await fetch(API+'?health=1',{signal:AbortSignal.timeout(16000)});
 assert.equal(a.status,200);const h=await a.json();assert.equal(h.ok,true);assert.equal(h.version,24);
 assert.equal(h.realWorldVerified,false);assert.equal(h.delivery,'OPT_IN_HTTP_POLL');
 const options=await fetch(API,{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(16000)});
 assert.equal(options.status,204);
 assert.equal(options.headers.get('access-control-allow-origin'),'*');
 const discovery=await fetch(API+'?action=discover&category=method',{signal:AbortSignal.timeout(16000)});
 assert.equal(discovery.status,200);const list=await discovery.json();
 assert.equal(list.schema,'relatte/relay-discovery/v1');assert.ok(Array.isArray(list.discovered));assert.equal(list.realWorldVerified,false);
 assert.ok(list.discovered.every(x=>x.trust==='SELF_REPORTED_SIGNED_SESSION_ONLY'));
});
test('live private relay rejects unsigned posts, bad packets and missing bearer access',async()=>{
 const no=await http('publish',{consent:false,packet:{}});
 assert.equal(no.status,400);assert.equal(no.result.confirmed,false);
 const bad=await http('publish',{consent:true,packet:{schema:'fake'}});
 assert.equal(bad.status,400);assert.equal(bad.result.error,'INVALID_SIGNED_PACKET');
 const absent=await http('status',{offerId:'00000000-0000-4000-8000-000000000000',secret:'0'.repeat(64),side:'guest'});
 assert.equal(absent.status,404);
});
test('REAL server test: two independent signed cartridges complete an isolated non-public opt-in handshake, with NO delivery claim',async()=>{
 const app=isolatedMain();app.get('seed-three').click();
 const world=app.api.createWorldFamily(app.api.state().projects,'A fully synthetic private signed relay protocol').forks[0];
 const source=app.api.portableWorldHtml(world);
 const A=cartridgeClient(source),B=cartridgeClient(source);
 const offer=await A.crypto.makeOffer({category:'method',label:'SYNTHETIC TEST ONLY no real materials or partner',quantity:1,scope:'copy',consent:true});
 const published=await http('publish',{consent:true,packet:offer,sandbox:true});
 assert.equal(published.status,201,JSON.stringify(published.result));
 const offerId=published.result.offerId,ownerSecret=published.result.ownerSecret;
 assert.equal(published.result.status,'PRIVATE_SYNTHETIC_TEST');
 assert.ok(/^[0-9a-f]{64}$/.test(ownerSecret));
 const discover=await (await fetch(API+'?action=discover&category=method',{signal:AbortSignal.timeout(16000)})).json();
 assert.ok(!discover.discovered.some(x=>x.id===offerId),'synthetic source never leaks to public catalogue');
 await B.crypto.importPacket(JSON.stringify(offer));
 const interested=await B.crypto.makeInterest({reason:'SYNTHETIC TEST ONLY I want to copy a method.',consent:true});
 const placed=await http('interest',{offerId,consent:true,packet:interested});
 assert.equal(placed.status,201,JSON.stringify(placed.result));
 const guestSecret=placed.result.guestSecret;assert.ok(/^[a-f0-9]{64}$/.test(guestSecret));
 const unauthorized=await http('status',{offerId,secret:'f'.repeat(64),side:'owner'});
 assert.equal(unauthorized.status,403);
 const ownerInbox=await http('status',{offerId,secret:ownerSecret,side:'owner'});
 assert.equal(ownerInbox.status,200);
 assert.equal(ownerInbox.result.interest.id,interested.id);
 assert.equal(ownerInbox.result.decision,null);
 await A.crypto.importPacket(JSON.stringify(ownerInbox.result.interest));
 const decision=await A.crypto.makeDecision('ADMIT');
 const posted=await http('decision',{offerId,secret:ownerSecret,packet:decision});
 assert.equal(posted.status,200,JSON.stringify(posted.result));
 assert.equal(posted.result.choice,'ADMIT');
 const consumerInbox=await http('status',{offerId,secret:guestSecret,side:'guest'});
 assert.equal(consumerInbox.status,200);
 assert.equal(consumerInbox.result.decision.id,decision.id);
 await B.crypto.importPacket(JSON.stringify(consumerInbox.result.decision));
 const ack=await B.crypto.makeAck();assert.equal(ack.body.status,'SEEN_NOT_DELIVERED');
 const delivered=await http('ack',{offerId,secret:guestSecret,packet:ack});
 assert.equal(delivered.status,200,JSON.stringify(delivered.result));
 assert.equal(delivered.result.status,'SEEN_NOT_DELIVERED');
 const finish=await http('status',{offerId,secret:ownerSecret,side:'owner'});
 assert.equal(finish.status,200);assert.equal(finish.result.state,'CLOSED');
 assert.equal(finish.result.ack.id,ack.id);
 await A.crypto.importPacket(JSON.stringify(finish.result.ack));
 assert.equal(A.crypto.ledger().remoteAck,ack.id);
 const repeat=await http('ack',{offerId,secret:guestSecret,packet:ack});assert.equal(repeat.status,409);
 assert.equal(app.api.state().learning.trials.length,0,'synthetic signed relay cannot count as actual field work');
});

test('live SPAWN 024 public download serves the actual executable application, not a placeholder or false HTML host',async()=>{
 const root='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-app-024';
 const health=await fetch(root+'?health=1',{signal:AbortSignal.timeout(16000)});
 assert.equal(health.status,200);const meta=await health.json();
 assert.equal(meta.version,24);assert.equal(meta.delivery,'HTML_ATTACHMENT_ONLY');assert.equal(meta.userConsentRequired,true);
 const out=await fetch(root+'/download',{signal:AbortSignal.timeout(16000)});
 assert.equal(out.status,200);
 assert.match(out.headers.get('content-disposition')||'',/attachment/);
 assert.match(out.headers.get('content-type')||'',/application\/octet-stream/);
 const live=await out.text();
 assert.ok(live.length>175000);
 assert.match(live,/<title>JAR;VIS SPAWN 024 — Opt-in Live Relay Between World Cartridges<\/title>/);
 assert.match(live,/function worldRelayRuntime/);
 assert.match(live,/function portableWorldHtml/);
 assert.match(live,/SPAWN 024 · Live reLATTE Relay/);
});
