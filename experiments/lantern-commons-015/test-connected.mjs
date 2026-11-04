import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {propose,validateCartridge} from './server/live-offer-router.mjs';

const cartridge=JSON.parse(readFileSync(new URL('./server/live-offer-001.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('./Lantern_015_Connected_JARVIS.html',import.meta.url),'utf8');
const ts=readFileSync(new URL('./server/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('./server/page.ts',import.meta.url),'utf8');
const sourceScripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

function browser(){
 const nodes=new Map(),calls=[],downloads=[],blobs=[];
 function el(id){
  if(!nodes.has(id)){
   const x={id,value:'',checked:false,disabled:false,dataset:{},events:{},textContent:'',children:[],
    classList:{add(){},remove(){},toggle(){}},setAttribute(){},
    addEventListener(k,fn){this.events[k]=fn},append(...args){this.children.push(...args)},
    replaceChildren(...args){this.children=[...args]},remove(){},
    click(){if(this.events.click)return this.events.click({target:this})},
    focus(){},select(){}};
   nodes.set(id,x);
  }
  return nodes.get(id);
 }
 const modes=['untangle','make','decide','debug'].map(k=>{
  const n=el('mode-'+k);n.dataset.mode=k;return n});
 const min=[5,10,20,40].map(k=>{
  const n=el('minute-'+k);n.dataset.min=String(k);return n});
 const doc={getElementById:el,querySelectorAll(x){
   if(x==='[data-mode]')return modes;
   if(x==='[data-min]')return min;
   return [];
 },createElement(k){
  const x=el('_created_'+nodes.size);
  x.click=()=>{if(k==='a')downloads.push(x.download)};
  return x;
 },body:{append(){},appendChild(){}}};
 const fake={schema:'jarvis.connected-capability-registry/v1',connected:['jarvis','world','ghot','static_os'].map(id=>({
  id,label:'Verified '+id,state:'CONNECTED_READ_ONLY',repo:'the-static-collective/'+id,
  ref:'main',source_sha:'a'.repeat(40)}))};
 const realPlan=propose('I can play guitar for 15 minutes now',cartridge);
 const fetch=async(url,opt={})=>{
  const u=String(url);calls.push({url:u,method:opt.method||'GET',body:opt.body});
  let result;
  if(u.endsWith('/capabilities'))result=fake;
  else if(u.endsWith('/execute')){
   const v=JSON.parse(opt.body);
   if(v.action==='source_report'){
    result={ok:true,performed:'REMOTE_GITHUB_SOURCE_FETCH_AND_COMPILE',writes:0,
      report:{github_source_blob_sha:'a'.repeat(40),kind:'REAL_'+v.source}};
   }else if(v.action==='route_offer'){
    result={ok:true,schema:'jarvis.remote-live-offer-receipt/v1',writes:0,
      action_executed_on_person_or_device:false,
      plan:realPlan};
   }else result={ok:false,reason:'REFUSED'};
  }else result={ok:false,reason:'BAD_URL'};
  return {ok:result.ok!==false,json:async()=>result};
 };
 const context=createContext({
  console,fetch,document:doc,window:{scrollTo(){},print(){}},
  navigator:{},Blob,Date,Math,JSON,Object,String,Number,
  URL:{createObjectURL(b){blobs.push(b);return 'blob:test'},revokeObjectURL(){}},
  setTimeout(){return 1},clearTimeout(){},
  confirm(){return true}
 });
 // No localStorage exists at all: a read or write would throw ReferenceError.
 for(const m of sourceScripts)new Script(m[1],{filename:'Lantern_015.inline.js'}).runInContext(context);
 return {el,calls,downloads,blobs,window:context.window};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}

test('exact reviewed JAR;VIS router/cartridge still accepts its proposal-only contract',()=>{
 assert.equal(validateCartridge(cartridge),true);
 const p=propose('I can play guitar for 15 minutes right now',cartridge);
 assert.equal(p.schema,'jarvis/capability-plan/v0');
 assert.equal(p.actions[0].id,'record-audio');
 assert.equal(p.intent.when,'now');
 assert.equal(cartridge.remote_execution,false);
});
test('full live page is exactly the one bundled in Supabase asset',()=>{
 const encoded=page.trim().replace(/^export const PAGE=/,'').replace(/;$/,'');
 assert.equal(JSON.parse(encoded),html);
 assert.equal(sourceScripts.length,2);
 assert.match(html,/<title>LANTERN 015/);
 assert.match(html,/03b \/ JAR;VIS · live connected tools/);
 assert.doesNotMatch(html,/localStorage\./);
 assert.match(html,/sessionStore=new Map/);
});
test('backend is read only with allowlisted public source files and no service-role access',()=>{
 for(const v of ['JAR-VIS','reLATTE','GHoT','static-os'])assert.ok(ts.includes(v));
 assert.match(ts,/SOURCE_KEYS\.includes/);
 assert.doesNotMatch(ts,/SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|service_role/);
 assert.doesNotMatch(ts,/https?:\/\/[^\s]*\$\{/);
 assert.match(ts,/CROSS_ORIGIN_POST_REFUSED/);
 assert.match(ts,/MAX_BODY=750/);
});
test('a fresh public page sends zero requests and cannot access browser localStorage',()=>{
 const b=browser();
 assert.equal(b.calls.length,0);
 assert.equal(b.window.LANTERN014.status().active,null);
 assert.equal(b.window.LANTERN014.version,'0.2.0');
 assert.equal(b.window.JARVIS015.githubAuthority,'READ_ONLY');
});
test('connected source registry is built ONLY from returned successful evidence',async()=>{
 const b=browser();b.el('connect-sources').click();await tick();
 assert.equal(b.calls.length,1);
 assert.match(b.calls[0].url,/\/capabilities$/);
 assert.equal(b.el('connected-offers').children.length,4);
 assert.match(b.el('connected-state').textContent,/4 \/ 4/);
});
test('source inspector creates a real downloadable local JSON evidence artifact',async()=>{
 const b=browser();b.el('connect-sources').click();await tick();
 const first=b.el('connected-offers').children[0];
 first.children[3].click();await tick();
 assert.equal(b.downloads.at(-1),'JARVIS_Connected_jarvis_Source_Report.json');
 const saved=JSON.parse(await b.blobs.at(-1).text());
 assert.equal(saved.writes,0);
 assert.equal(saved.report.github_source_blob_sha,'a'.repeat(40));
 assert.equal(JSON.parse(b.calls.at(-1).body).source,'jarvis');
});
test('a short private offer is NEVER sent before explicit consent',async()=>{
 const b=browser();
 b.el('connected-offer-text').value='I can play guitar for 15 minutes now';
 b.el('connected-route').click();await tick();
 assert.equal(b.calls.length,0);
 assert.match(b.el('connected-route-result').textContent,/explicit consent/);
 b.el('connected-consent').checked=true;
 b.el('connected-route').click();await tick();
 assert.equal(b.calls.length,1);
 const sent=JSON.parse(b.calls[0].body);
 assert.deepEqual(Object.keys(sent).sort(),['action','offer']);
 assert.equal(sent.action,'route_offer');
 assert.match(b.el('connected-route-result').textContent,/PROPOSALS ONLY/);
 assert.equal(b.window.JARVIS015.lastReceipt.action_executed_on_person_or_device,false);
 b.el('connected-receipt').click();
 assert.equal(b.downloads.at(-1),'JARVIS_Live_Routing_Receipt.json');
});
test('local original 014 generators remain available and actual completion unclaimed',()=>{
 const b=browser();b.el('quick').click();b.el('jarvis-checklist').click();
 const state=b.window.LANTERN014.status();
 assert.equal(state.active.completed,false);
 assert.match(state.active.note,/EXECUTED CHECKLIST/);
 assert.equal(b.calls.length,0);
});
