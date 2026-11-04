import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const html=readFileSync(new URL('./Lantern_015_JARVIS_Connected_Solo_Desk.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

function browser(remote=null){
  const nodes=new Map(),disk=new Map(),downloads=[],blobs=[],remoteCalls=[];
  function element(id){
    if(!nodes.has(id)){
      const n={id,value:'',checked:false,dataset:{},textContent:'',style:{},children:[],events:{},
        classList:{add(){},remove(){},toggle(){}},setAttribute(){},
        addEventListener(k,fn){this.events[k]=fn},
        append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=[...xs]},
        remove(){},focus(){},select(){},click(){this.events.click?.({target:this});}};
      nodes.set(id,n);
    }
    return nodes.get(id);
  }
  const modes=['untangle','make','decide','debug'].map(k=>{
    const e=element('mode-'+k);e.dataset.mode=k;return e});
  const min=[5,10,20,40].map(k=>{
    const e=element('minute-'+k);e.dataset.min=String(k);return e});
  const document={
    getElementById:element,
    querySelectorAll(s){return s==='[data-mode]'?modes:s==='[data-min]'?min:[]},
    createElement(tag){const e=element('_element_'+nodes.size);
      e.click=()=>{if(tag==='a')downloads.push(e.download);};return e},
    body:{appendChild(){}}
  };
  const window={scrollTo(){},print(){}};
  const localStorage={getItem(k){return disk.get(k)||null},setItem(k,v){disk.set(k,String(v))}};
  const fetch=async(url,opts)=>{remoteCalls.push({url:String(url),method:opts?.method||'GET',credentials:opts?.credentials,referrerPolicy:opts?.referrerPolicy});if(remote)return remote(url,opts);throw Error('OFFLINE_NETWORK_UNAVAILABLE')};
  const context=createContext({document,window,localStorage,console,Blob,Date,Math,fetch,AbortController,
    URL:{createObjectURL(blob){blobs.push(blob);return 'blob:offline'},revokeObjectURL(){}},
    navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout(){return 1},clearTimeout(){},confirm(){return true}});
  new Script(scripts[0][1],{filename:'solo-desk.js'}).runInContext(context);
  return {element,window,disk,downloads,blobs,remoteCalls};
}

test('single-file client: network only via explicitly requested read-only bridge',()=>{
  assert.equal(scripts.length,1);
  assert.match(html,/<style>/);
  assert.doesNotMatch(html,/<script\s+src=/i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  assert.match(scripts[0][1],/\bfetch\s*\(url,/);
  assert.doesNotMatch(scripts[0][1],/\b(?:XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
});
test('four different modes each make a tangible note with a finish line',()=>{
  for(const [k,marker] of [['untangle','KNOWN'],['make','FIRST DRAFT'],
    ['decide','Option A'],['debug','Expected behavior']]){
    const c=browser();
    c.element('mode-'+k).click();
    c.element('problem').value='Organize ten real photos';
    c.element('finish').value='ten selected pictures';
    c.element('build').click();
    const p=c.window.LANTERN014.status().active;
    assert.equal(p.mode,k);assert.equal(p.completed,false);
    assert.ok(p.note.includes(marker));assert.ok(p.finishLine.includes('ten selected pictures'));
  }
});
test('quick-start has no prerequisite other than one click',()=>{
  const c=browser();c.element('quick').click();
  assert.equal(c.window.LANTERN014.status().active.time,5);
  assert.ok(c.element('working-note').value.includes('NEXT'));
});
test('completion is explicitly user-reported and recorded separately from drafts',()=>{
  const c=browser();c.element('quick').click();
  c.element('working-note').value='Real result: I named ten files';
  c.element('evidence').value='Counted the filenames myself';
  c.element('save').click();
  let saved=JSON.parse(c.disk.get('lantern014_solo_desk_v1'));
  assert.equal(saved.shelf[0].completed,false);
  assert.equal(saved.shelf[0].evidence,'Counted the filenames myself');
  c.element('completed').checked=true;c.element('completed').events.change();
  c.element('save').click();
  saved=JSON.parse(c.disk.get('lantern014_solo_desk_v1'));
  assert.equal(saved.shelf[0].completed,true);
  assert.equal(saved.shelf[1].completed,false);
});
test('forking a world does not overwrite the historical snapshot',()=>{
  const c=browser();c.element('quick').click();
  const a=c.window.LANTERN014.status().active.id;
  c.element('save').click();c.element('fork').click();
  const b=c.window.LANTERN014.status().active;
  assert.notEqual(a,b.id);assert.equal(b.parent,a);assert.equal(b.completed,false);
  assert.equal(JSON.parse(c.disk.get('lantern014_solo_desk_v1')).shelf.length,1);
});
test('shelf capacity is bounded; old entries are never silently deleted',()=>{
  const c=browser();c.element('quick').click();
  for(let i=0;i<61;i++)c.element('save').click();
  assert.equal(c.window.LANTERN014.status().snapshots,60);
});
test('local backup is a downloadable file, not an upload',()=>{
  const c=browser();c.element('quick').click();c.element('save').click();
  c.element('export-shelf').click();
  assert.deepEqual(c.downloads,['Lantern_014_Solo_Desk_Shelf.json']);
});
test('user strings render as literal text, not evaluated HTML',()=>{
  const c=browser();c.element('problem').value='<img src=x onerror=alert(1)>';
  c.element('build').click();
  assert.match(c.element('action-body').textContent,/<img src=x/);
  assert.equal(c.element('action-body').children.length,0);
});

test('Step 03 offers only executable local abilities, and all buttons are wired',()=>{
  const c=browser();
  const offers=c.window.LANTERN014.offers();
  assert.equal(offers.length,4);
  assert.deepEqual([...offers].map(x=>x.id),['checklist','tracker','page','audit']);
  for(const x of offers)assert.ok(c.element('jarvis-'+x.id).events.click);
  assert.equal(c.element('jarvis').id,'jarvis');
  assert.match(c.element('jarvis-context').textContent,/Create or restore/);
});
test('JAR;VIS checklist modifies working note but cannot mark external tasks done',()=>{
  const c=browser();
  c.element('problem').value='Find ten useful photos';
  c.element('finish').value='ten selected photos';
  c.element('build').click();
  const before=c.window.LANTERN014.status().active.note;
  c.element('jarvis-checklist').click();
  const after=c.window.LANTERN014.status().active;
  assert.ok(after.note.length>before.length);
  assert.match(after.note,/JAR;VIS · EXECUTED CHECKLIST/);
  assert.match(after.note,/- \[ \]/);
  assert.equal(after.completed,false);
  assert.match(c.element('jarvis-response').textContent,/DONE HERE/);
});
test('JAR;VIS creates a real downloadable CSV with a usable structured task table',async()=>{
  const c=browser();c.element('mode-decide').click();
  c.element('problem').value='Decide which photo set to publish';
  c.element('build').click();
  c.element('jarvis-tracker').click();
  assert.equal(c.downloads.at(-1),'Lantern_JARVIS_Work_Tracker.csv');
  const csv=await c.blobs.at(-1).text();
  assert.match(csv,/Project","Task","Status","Evidence","Date/);
  assert.match(csv,/Not started/);
  assert.equal(csv.split(/\r\n/).length,7);
  assert.equal(c.window.LANTERN014.status().active.completed,false);
});
test('JAR;VIS produces a standalone HTML work card and encodes user-supplied markup',async()=>{
  const c=browser();
  c.element('problem').value='<img src=x onerror=alert(1)> photos';
  c.element('build').click();
  c.element('jarvis-page').click();
  assert.equal(c.downloads.at(-1),'Lantern_JARVIS_Work_Card.html');
  const html=await c.blobs.at(-1).text();
  assert.match(html,/<ol>/);
  assert.match(html,/type="checkbox"/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.doesNotMatch(html,/<script.*src=/i);
  assert.equal(c.window.LANTERN014.status().active.completed,false);
});
test('JAR;VIS structural audit reports gaps, but never claims to verify outside outcomes',()=>{
  const c=browser();
  c.element('problem').value='Fix a broken screen';
  c.element('build').click();
  c.element('jarvis-audit').click();
  assert.match(c.element('jarvis-response').textContent,/\/4 document checks passed/);
  assert.match(c.element('jarvis-response').textContent,/Missing: one concrete desired outcome/);
  assert.match(c.element('jarvis-response').textContent,/structural check only/);
  assert.equal(c.window.LANTERN014.status().active.completed,false);
});

const ready = {schema:'jarvis-live-bridge-001.0.0',ok:true,mode:'PUBLIC_READ_ONLY',writes_enabled:false,
 user_work_received:false,offers:[{id:'inspect_public_source'},{id:'check_public_ci'}]};
const source = {schema:'jarvis-live-bridge-001.0.0',ok:true,action:'inspect',target:'jarvis',writes_performed:0,
 user_work_received:false,repository:'the-static-collective/JAR-VIS',source_url:'https://raw.githubusercontent.com/the-static-collective/JAR-VIS/main/README.md',
 observed_at:'2026-11-04T16:45:16Z',sha256:'a'.repeat(64),source_bytes:50,excerpt:'Public source only',
 claim:'read-only source; no remote worker'};
const ci = {schema:'jarvis-live-bridge-001.0.0',ok:true,action:'ci',target:'relatte',writes_performed:0,
 user_work_received:false,repository:'the-static-collective/reLATTE',source_url:'https://api.github.com/repos/the-static-collective/reLATTE/actions/runs?per_page=5',
 observed_at:'2026-11-04T16:45:17Z',run_count:1,runs:[{name:'verify',status:'completed',conclusion:'success',url:'https://github.com/the-static-collective/reLATTE/actions/runs/123'}],claim:'read-only evidence'};
const success=(data)=>({ok:true,json:async()=>data});
test('live bridge makes no request at startup, even with private local draft',()=>{
 const c=browser(async()=>success(ready));
 c.element('problem').value='secret-NEVER-SEND';
 c.element('build').click();
 assert.equal(c.remoteCalls.length,0);
 assert.equal(c.window.LANTERN014.liveStatus().ready,false);
 assert.equal(c.window.LANTERN014.version,'0.3.0');
});
test('connected discovery checks an actual capability registry without uploading a private task',async()=>{
 const c=browser(async()=>success(ready));c.element('problem').value='secret-NEVER-SEND';
 c.element('build').click();
 await c.window.LANTERN014.discoverLive();
 assert.equal(c.window.LANTERN014.liveStatus().ready,true);
 assert.equal(c.window.LANTERN014.liveStatus().offers.length,2);
 assert.equal(c.remoteCalls.length,1);
 assert.equal(c.remoteCalls[0].method,'GET');
 assert.equal(c.remoteCalls[0].credentials,'omit');
 assert.equal(c.remoteCalls[0].referrerPolicy,'no-referrer');
 assert.doesNotMatch(c.remoteCalls[0].url,/secret-NEVER-SEND/);
});
test('actual source evidence can be downloaded and attached to the note, but cannot complete external work',async()=>{
 const c=browser(async(url)=>success(String(url).includes('?')?source:ready));
 c.element('problem').value='PRIVATE-GOAL';c.element('build').click();
 await c.window.LANTERN014.discoverLive();
 c.element('live-target').value='jarvis';
 await c.window.LANTERN014.executeLive('inspect');
 assert.match(c.element('live-report').textContent,/SHA-256/);
 assert.equal(c.window.LANTERN014.status().active.completed,false);
 c.element('live-download').click();
 assert.equal(c.downloads.at(-1),'JARVIS_Connected_Public_Evidence.json');
 c.element('live-attach').click();
 assert.match(c.window.LANTERN014.status().active.note,/JAR;VIS CONNECTED PUBLIC EVIDENCE/);
 assert.equal(c.window.LANTERN014.status().active.completed,false);
 assert.equal(c.remoteCalls.length,2);
 assert.ok(c.remoteCalls.every(x=>!x.url.includes('PRIVATE-GOAL')));
});
test('live CI evidence does not claim a completed real-world result',async()=>{
 const c=browser(async(url)=>success(String(url).includes('?')?ci:ready));
 await c.window.LANTERN014.discoverLive();
 c.element('live-target').value='relatte';
 await c.window.LANTERN014.executeLive('ci');
 assert.match(c.element('live-report').textContent,/verify \| completed \| success/);
 assert.match(c.element('live-report').textContent,/This read caused 0 remote writes/);
 assert.equal(c.window.LANTERN014.liveStatus().lastEvidence.action,'ci');
});
test('bridge failure leaves local actions working, without fake source or sent private data',async()=>{
 const c=browser(async()=>{throw Error('No network')});
 c.element('quick').click();
 await c.window.LANTERN014.discoverLive();
 assert.equal(c.window.LANTERN014.liveStatus().ready,false);
 assert.match(c.element('live-report').textContent,/NOT CONNECTED/);
 c.element('jarvis-checklist').click();
 assert.match(c.window.LANTERN014.status().active.note,/EXECUTED CHECKLIST/);
 assert.equal(c.window.LANTERN014.status().active.completed,false);
});
