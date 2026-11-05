import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const html=fs.readFileSync(new URL('./Lantern_026_Deep_Glean.html',import.meta.url),'utf8');
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
 const box={document:d,window:null,TextEncoder,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:webcrypto,Blob,Uint8Array,Date,JSON,Array,Object,String,Set,URL:Object.assign(URL,{createObjectURL:()=>{download.push(true);return 'blob:test'},revokeObjectURL(){}}),setTimeout:()=>{},console};
 box.window=box;get('kind').value='gather';get('cap-direction').value='offer';get('cap-category').value='food';
 const match=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(match);
 new vm.Script(match[1],{filename:'spawn-024-main.js'}).runInNewContext(box);
 return {get,api:box.SPAWN_026,download};
}
function cartridgeClient(markup,network=fetch){
 const match=markup.match(/<script>([\s\S]*?)<\/script>/);assert.ok(match);
 const elements=new Map(),downloads=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const document={getElementById:get,createElement:t=>new Element(t),body:new Element('body'),visibilityState:'visible'};
 const box={document,fetch:network,crypto:webcrypto,TextEncoder,Uint8Array,Blob,btoa,atob,Date,JSON,Array,Object,String,Set,
  URL:Object.assign(URL,{createObjectURL:()=>{downloads.push(true);return 'blob:output'},revokeObjectURL(){}}),setTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},console};
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

test('025 constructs a real local HTML work product from an existing operation without claiming task completion',async()=>{
 const b=isolatedMain();b.get('seed-three').click();
 const p=b.api.state().projects[0],task=p.tasks[0],originalTask=task.state;
 const result=await b.api.constructSoloArtifact({projectId:p.id,taskId:task.id,resource:'A real, inspected laptop with text editor',outcome:'One printable event preparation sheet',format:'page',resourceStatus:'checked'});
 assert.equal(result.record.resourceStatus,'checked');
 assert.equal(result.artifact.filename,'one-printable-event-preparation-sheet.html');
 assert.match(result.artifact.content,/<!doctype html>/);
 assert.match(result.artifact.content,/What actually happened/);
 assert.match(result.artifact.content,new RegExp(task.title.slice(0,15)));
 assert.equal(result.artifact.bytes,new TextEncoder().encode(result.artifact.content).length);
 assert.match(result.artifact.hash,/^[a-f0-9]{64}$/);
 assert.equal(task.state,originalTask,'physical work never silently completed');
 assert.equal(task.observation,'','no fake observations');
 assert.equal(b.api.state().work.records.length,1,'metadata receipt stored separately from source bytes');
 assert.ok(!JSON.stringify(b.api.state().work).includes('A real, inspected laptop'),'raw personal resource text not stored in receipts');
 assert.equal(b.api.validSoloWork(b.api.state().work),true);
});
test('025 builds four substantially distinct, bounded and reviewable actual artifacts',async()=>{
 const b=isolatedMain();b.get('seed-three').click();
 const p=b.api.state().projects[0],task=p.tasks[0],artifacts=[];
 for(const format of ['page','checklist','tracker','recipe']){
  const result=await b.api.constructSoloArtifact({projectId:p.id,taskId:task.id,resource:'Pen, paper, and a usable computer',outcome:'Organized real-world community work',format,resourceStatus:'unverified'});
  artifacts.push(result.artifact);
 }
 assert.equal(artifacts.length,4);
 assert.equal(new Set(artifacts.map(x=>x.filename)).size,4);
 assert.match(artifacts[1].content,/- \[ \]/);
 assert.match(artifacts[2].content,/stage,specific_work|\"stage\",\"specific_work\"/);
 const cartridge=JSON.parse(artifacts[3].content);
 assert.equal(cartridge.schema,'relatte/solo-work-method/v1');
 assert.equal(cartridge.provenance.verifiedFieldOutcome,false);
 assert.equal(p.tasks[0].state,'todo');
 assert.ok(artifacts.every(a=>a.content.length>120&&a.bytes>100));
});
test('025 refuses imaginary operators, unknown tasks and meaningless empty inputs',()=>{
 const b=isolatedMain();b.get('seed-three').click();const p=b.api.state().projects[0],task=p.tasks[0];
 assert.throws(()=>b.api.renderSoloBytes({projectId:'not-ours',taskId:task.id,resource:'a long real resource',outcome:'A complete output',format:'page',resourceStatus:'checked'}),/actual existing operation/);
 assert.throws(()=>b.api.renderSoloBytes({projectId:p.id,taskId:'not-a-task',resource:'a long real resource',outcome:'A complete output',format:'page',resourceStatus:'checked'}),/actual workboard task/);
 assert.throws(()=>b.api.renderSoloBytes({projectId:p.id,taskId:task.id,resource:'',outcome:'A complete output',format:'page',resourceStatus:'checked'}),/Describe an actual existing/);
});
test('025 provider intent needs fresh approval and never writes, signs in, or captures secrets',async()=>{
 const b=isolatedMain();b.get('seed-three').click();const p=b.api.state().projects[0];
 const result=await b.api.constructSoloArtifact({projectId:p.id,taskId:p.tasks[0].id,resource:'Existing typed notes and paper forms',outcome:'A usable volunteer signup checklist',format:'checklist',resourceStatus:'checked'});
 const art=result.artifact;
 assert.throws(()=>b.api.providerIntent(art,'google-drive','volunteer-checklist.md',false),/Review and explicitly authorize/);
 const intent=b.api.providerIntent(art,'google-drive','volunteer-checklist.md',true);
 assert.equal(intent.schema,'relatte/provider-create-intent/v1');
 assert.equal(intent.action,'CREATE_NEW_ONLY');
 assert.equal(intent.controls.requiresProviderOAuth,true);
 assert.equal(intent.controls.requiresExplicitPerActionApproval,true);
 assert.equal(intent.controls.credentialIncluded,false);
 assert.equal(intent.controls.overwriteAllowed,false);
 assert.equal(intent.artifact.sha256,art.hash);
 assert.equal(intent.artifact.body,art.content);
 assert.doesNotMatch(JSON.stringify(intent),/access_token|refresh_token|client_secret|provider_token|api_key/i);
 assert.equal(b.api.state().work.records[0].providerReceipt,null);
 const gh=b.api.providerIntent(art,'github','the-static-collective/reLATTE/docs/checklist.md',true,'experiment/spawn-025-solo-executor-connector-bridge');
 assert.equal(gh.target.owner,'the-static-collective');
 assert.equal(gh.target.repo,'reLATTE');
 assert.equal(gh.target.expectedExistingSha,null);
 assert.equal(gh.target.branch,'experiment/spawn-025-solo-executor-connector-bridge');
 assert.throws(()=>b.api.providerIntent(art,'github','the-static-collective/reLATTE/docs/checklist.md',true,'main'),/non-default GitHub work branch/);
 assert.throws(()=>b.api.providerIntent(art,'github','owner/repo/.github/workflows/unsafe.yml',true),/Cannot create workflow/);
 assert.throws(()=>b.api.providerIntent(art,'google-drive','../secrets.md',true),/safe Google Drive filename/);
});
test('025 method export does not copy operator private notes, task title, goals or identifiers',async()=>{
 const b=isolatedMain();b.get('seed-three').click();const p=b.api.state().projects[0];p.tasks[0].title='Private task for third-party details 827199';
 const result=await b.api.constructSoloArtifact({projectId:p.id,taskId:p.tasks[0].id,resource:'Private home address details and paper forms',outcome:'A field-work artifact for my personal files',format:'recipe',resourceStatus:'unverified'});
 const method=b.api.methodOnly(result.artifact);
 const raw=JSON.stringify(method);
 assert.equal(method.schema,'relatte/solo-execution-method/v1');
 assert.doesNotMatch(raw,/827199|Private home address|personal files|taskId|projectId/);
 assert.equal(method.physicalOutcomeClaim,false);
});
test('025 actual UI offers one-action artifact generation, download and review-only provider intent',async()=>{
 const b=isolatedMain();b.get('seed-three').click();
 b.get('exec-resource').value='Verified printer, notebook, and personal notes';
 b.get('exec-outcome').value='One real rehearsal procedure';
 b.get('exec-format').value='checklist';
 b.get('exec-source').value='checked';
 await b.get('exec-make').click();
 assert.equal(b.api.state().work.records.length,1);
 assert.match(b.get('exec-status').textContent,/digital file has been constructed locally/);
 b.get('exec-download').click();
 assert.equal(b.download.length,1);
 b.get('exec-provider').value='google-drive';
 b.get('exec-destination').value='rehearsal-procedure.md';
 b.get('exec-bridge').click();
 assert.match(b.get('exec-bridge-status').textContent,/NO PROVIDER REQUEST/);
 b.get('exec-approve').checked=true;
 b.get('exec-bridge').click();
 const prepared=JSON.parse(b.get('exec-intent').value);
 assert.equal(prepared.provider,'google-drive');
 assert.equal(prepared.action,'CREATE_NEW_ONLY');
 assert.match(b.get('exec-bridge-status').textContent,/No OAuth, account connection, remote read\/write/);
});

test('025 actually computes a same-human cross-hat capability circuit from only recorded category overlaps',async()=>{
 const b=isolatedMain();b.get('seed-three').click();const [organizer,grower,artist]=b.api.state().projects;
 organizer.caps.push({id:'need-1',direction:'need',category:'tools',detail:'One reusable, suitably tested tool for a gathering'});
 grower.caps.push({id:'offer-1',direction:'offer',category:'tools',detail:'One previously inspected tool for farm use'});
 artist.caps.push({id:'offer-mismatch',direction:'offer',category:'music',detail:'Original guitar piece; no permission granted'});
 const created=await b.api.constructSoloArtifact({projectId:organizer.id,taskId:organizer.tasks[0].id,
  resource:'A verified pen and several existing recorded offers',outcome:'Local capability circuit for one operator',format:'circuit',resourceStatus:'checked'});
 const data=JSON.parse(created.artifact.content);
 assert.equal(data.schema,'relatte/solo-capability-circuit/v1');
 assert.equal(data.operatorCount,1);
 assert.equal(data.hatCount,3);
 assert.equal(data.possibleCrossingCount,1);
 assert.equal(data.completeTransactions,0);
 assert.equal(data.possibleCrossings[0].sourceHat.title,grower.title);
 assert.equal(data.possibleCrossings[0].targetHat.title,organizer.title);
 assert.equal(data.possibleCrossings[0].status,'POSSIBLE_CATEGORY_OVERLAP_UNVERIFIED');
 assert.doesNotMatch(created.artifact.content,/independent confirmed partner/);
 assert.equal(organizer.tasks[0].state,'todo','computed category overlap cannot complete work');
});

function sampleInventory(){
 const entries=[
  ['google-drive','file-001','Fellowship volunteer coordination notes','event signup and reception program','https://docs.google.com/document/d/file-001/edit'],
  ['google-drive','file-002','Garden harvest pickup plan','farm produce distribution schedule','https://drive.google.com/file/d/file-002/view'],
  ['github','org/fellowship-calendar','fellowship-calendar','Volunteer signup and event scheduling','https://github.com/org/fellowship-calendar'],
  ['github','org/garden-whisperer','garden-whisperer','Farm and garden coordination tool','https://github.com/org/garden-whisperer'],
  ['google-drive','file-005','A distinct illustration portfolio','no matching event or farm descriptions','https://drive.google.com/file/d/file-005/view']
 ];
 return {schema:'relatte/deep-glean-inventory/v1',version:1,createdAt:'2026-11-04T12:00:00.000Z',
  coverage:[
   {provider:'google-drive',scope:'drive.metadata.readonly authorized subset',pages:2,complete:false,reason:'Additional pages not yet scanned'},
   {provider:'github',scope:'GitHub App installed on two selected repositories',pages:1,complete:true,reason:''}
  ],entries:entries.map(([provider,id,title,summary,url])=>({
   provider,id,title,summary,url,kind:provider==='github'?'repository':'file',mime:'text/metadata',path:'',
   modifiedAt:'2026-10-01T10:00:00.000Z',visibility:'unknown',level:'metadata'
  }))};
}
test('026 private inventory validates exact source contract and rejects credential-shaped injected fields',()=>{
 const b=isolatedMain(),x=sampleInventory();
 assert.equal(b.api.validDeepInventory(x),true);
 assert.equal(b.api.validDeepInventory({...x,accessToken:'sensitive'}),false);
 const invalid=structuredClone(x);invalid.entries[0].url='javascript:alert(1)';
 assert.equal(b.api.validDeepInventory(invalid),false);
 const injected=structuredClone(x);injected.entries[0].oauth_token='evil';
 assert.equal(b.api.validDeepInventory(injected),false);
 const duplicate=structuredClone(x);duplicate.entries.push(duplicate.entries[0]);
 assert.equal(b.api.validDeepInventory(duplicate),false);
 const oversize='x'.repeat(3000001);
 assert.equal(b.api.deepImport(oversize).ok,false);
 assert.equal(b.api.deepCatalog(),null);
});
test('026 discovers actual named source matches and noninvented Google-Drive-to-GitHub links',()=>{
 const b=isolatedMain();const x=sampleInventory();
 const imported=b.api.deepImport(JSON.stringify(x));assert.equal(imported.ok,true);
 assert.equal(imported.entries,5);
 const results=b.api.deepSearch('Fellowship volunteer signup');
 assert.equal(results.ok,true);
 assert.ok(results.matched>=2);
 assert.equal(results.results[0].entry.provider,'google-drive');
 assert.ok(results.results.some(r=>r.entry.id==='org/fellowship-calendar'));
 assert.ok(results.cross.some(c=>new Set([c.a.provider,c.b.provider]).size===2));
 assert.ok(results.cross.every(c=>c.common.length>=1));
 assert.equal(results.results[0].claim,'METADATA LEAD, CONTENT UNKNOWN');
 assert.ok(results.results.every(r=>x.entries.some(v=>v.id===r.entry.id)),'no fabricated files');
 assert.equal(b.api.state().work.records.length,0,'discovery is not a completed work product');
});
test('026 incomplete scans stay explicitly incomplete; no account-wide or contents claim',()=>{
 const b=isolatedMain();const x=sampleInventory();
 b.api.deepImport(x);
 const catalog=b.api.deepCatalog();
 assert.equal(catalog.coverage[0].complete,false);
 assert.equal(catalog.coverage[0].pages,2);
 assert.equal(catalog.coverage[1].complete,true);
 assert.equal(catalog.entries[0].level,'metadata');
 assert.ok(!JSON.stringify(b.api.state()).includes('Fellowship volunteer coordination notes'),
  'private inventory must not be in localStorage-backed main state');
 assert.match(b.get('deep-coverage').textContent+b.get('deep-coverage').children.map(c=>c.textContent).join(' '),/PARTIAL/);
});
test('026 method export never copies file IDs, private titles, source links or provider OAuth credentials',()=>{
 const b=isolatedMain();b.api.deepImport(sampleInventory());b.api.deepSearch('garden');
 const safe=JSON.stringify(b.api.deepMethod());
 assert.equal(b.api.deepMethod().privateMetadataIncluded,false);
 assert.doesNotMatch(safe,/file-001|fellowship-calendar|Fellowship volunteer|docs.google.com|access_token/);
 assert.equal(b.api.deepCatalog().entries.length,5);
 b.get('deep-clear').click();
 assert.equal(b.api.deepCatalog(),null);
 assert.match(b.get('deep-status').textContent,/Discarded private index/);
});
test('026 interactive offline UI shows evidenced results, then excludes one and never contacts a provider',()=>{
 const b=isolatedMain();b.api.deepImport(sampleInventory());
 b.get('deep-query').value='Garden harvest plan';
 b.get('deep-project').value='';
 b.get('deep-search').click();
 const results=b.get('deep-results').children;
 assert.ok(results.length>=3);
 assert.match(b.get('deep-status').textContent,/Matched/);
 assert.equal(b.api.deepCatalog().entries.length,5);
 const item=results.find(x=>x.tagName==='article');assert.ok(item);
 const actions=item.children.find(x=>x.className==='line');assert.ok(actions);
 actions.children[1].click();
 assert.equal(b.api.deepCatalog().entries.length,4);
 assert.match(b.get('deep-status').textContent,/Excluded source/);
 assert.equal(b.api.state().projects.length,0,'search does not invent operators');
});
