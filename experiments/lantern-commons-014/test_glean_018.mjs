import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const html=fs.readFileSync(new URL('./Lantern_018_Gleaning_World_Builder.html',import.meta.url),'utf8');
const found=html.match(/<script>([\s\S]*?)<\/script>/g);
assert.equal(found?.length,1,'one local inline runtime');
const js=found[0].slice(8,-9);
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.style={};this.value='';this.textContent='';this.checked=false;this.disabled=false;this.maxLength=500;}
 append(...xs){this.children.push(...xs);return this}
 replaceChildren(...xs){this.children=[...xs]}
 addEventListener(k,fn){this.events[k]=fn}
 setAttribute(k,v){this[k]=v}
 remove(){}
 after(){}
 scrollIntoView(){}
 click(){return this.events.click?.({preventDefault(){},target:this})}
}
function browser(){
 const elements=new Map(),downloads=[],storage=new Map();
 function get(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)}
 const doc={getElementById:get,createElement:t=>new Element(t),createTextNode:t=>({textContent:String(t)}),body:new Element('body')};
 const sandbox={document:doc,window:null,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:webcrypto,Blob,Uint8Array,Date,JSON,Array,Object,String,Set,URL:{createObjectURL:()=>{downloads.push('blob');return 'blob:test'},revokeObjectURL(){}},setTimeout:()=>{},console};
 sandbox.window=sandbox;
 get('kind').value='gather';get('cap-direction').value='offer';get('cap-category').value='food';
 new vm.Script(js,{filename:'spawn-017-app.js'}).runInNewContext(sandbox);
 return {elements,get,api:sandbox.SPAWN_018,downloads,storage};
}
test('standalone offline, without remote dependencies, keys or sending private notes',()=>{
 assert.match(html,/<title>JAR;VIS SPAWN 018/);
 assert.doesNotMatch(html,/<script[^>]+src=/i);
 assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
 assert.doesNotMatch(html,/service_role|PRIVATE_KEY|Bearer\s+[a-z0-9]/i);
 assert.match(html,/No notes or capability records are sent automatically/);
});
test('one actual operator can seed three hats with actionable work and no fabricated successes',()=>{
 const b=browser();assert.equal(b.api.state().projects.length,0);
 b.get('seed-three').click();
 const p=b.api.state().projects;
 assert.equal(p.length,3);
 assert.equal(JSON.stringify(p.map(x=>x.type)),JSON.stringify(['gather','grow','art']));
 assert.ok(p.every(x=>x.tasks.length>=4&&x.tasks.every(t=>t.state==='todo'&&t.observation==='')));
 assert.match(b.get('focus').children[0].children[1].textContent,/Write down the actual space/);
 assert.equal(b.downloads.length,0);
});
test('record real multi-hat capabilities and show only possible internal leads',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const offer={id:'a',direction:'offer',category:'food',detail:'Six trays of produce, counted'};
 const need={id:'b',direction:'need',category:'food',detail:'Food for gathering'};
 ps[1].caps.push(offer);ps[0].caps.push(need);
 var matches=b.api.matches(ps);assert.equal(matches.length,1);
 assert.equal(matches[0].from.id,ps[1].id);assert.equal(matches[0].to.id,ps[0].id);
 ps[0].caps.push({...offer,id:'c'});assert.equal(b.api.matches([ps[0]]).length,0,'no false two-person match within same hat');
});
test('method cartridge can be reproduced but strips attempts and recorded resource offers',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects[0];
 p.tasks[0].state='done';p.tasks[0].observation='Real personal details';p.caps.push({id:'secret',direction:'offer',category:'space',detail:'Sensitive pickup address'});
 const c=b.api.cartridge(p);
 assert.ok(b.api.validCartridge(c));
 assert.equal(c.tasks.length,p.tasks.length);
 const string=JSON.stringify(c);
 assert.doesNotMatch(string,/Real personal details|Sensitive pickup address|secret|done|parentId/);
 assert.equal(c.schema,'abundent/operator-cartridge/v1');
 assert.equal(b.api.validCartridge({...c,tasks:[]}),false);
 assert.equal(b.api.validCartridge({...c,tasks:['a'.repeat(500)]}),false);
});
test('CSV formula cells and portable HTML are escaped',()=>{
 const b=browser();
 assert.equal(b.api.csvCell('=IMPORTXML("https://example.test")'),'"\'=IMPORTXML(""https://example.test"")"');
 assert.equal(b.api.csvCell(' +2'),'"\' +2"');
 assert.equal(b.api.htmlEscape('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
});
test('user creates a fourth arbitrary operation; all state stays local',()=>{
 const b=browser();b.get('seed-three').click();b.get('kind').value='other';b.get('mission').value='Repair the radio setup';b.get('goal').value='Get one working connection';
 b.get('add').click();assert.equal(b.api.state().projects.length,4);
 const p=b.api.state().projects[3];assert.equal(p.type,'other');
 assert.equal(p.title,'Repair the radio setup');assert.ok(p.tasks.length>=3);
 assert.ok(b.storage.has('jarvis_spawn_018_v1'));
 assert.match(b.get('seed-status').textContent,/Operation created/);
});

test('private backup restores only from the matching bounded schema',()=>{
 const b=browser();b.get('seed-three').click();const current=b.api.state();
 const privateCopy=JSON.parse(JSON.stringify(current));
 privateCopy.projects[0].tasks[0].observation='A personal note';
 privateCopy.projects[0].tasks[0].state='done';
 assert.equal(b.api.validBackup(privateCopy),true);
 assert.equal(b.api.validBackup({...privateCopy,schema:'other'}),false);
 assert.equal(b.api.validBackup({...privateCopy,projects:[{...privateCopy.projects[0],tasks:[{...privateCopy.projects[0].tasks[0],observation:'z'.repeat(501)}]}]}),false);
});

test('community, grower and artist receive smallest-first distinct material questions',()=>{
 const b=browser();b.get('seed-three').click();
 const p=b.api.state().projects;
 const a=b.api.deriveKit(p[0]),g=b.api.deriveKit(p[1]),m=b.api.deriveKit(p[2]);
 assert.match(a.slice,/run-of-show/);
 assert.ok(a.questions.some(x=>x.key==='details'&&x.essential));
 assert.ok(g.questions.some(x=>x.key==='resources'&&x.essential));
 assert.ok(m.questions.some(x=>x.key==='instrument'&&x.essential));
 assert.ok(a.questions.every(x=>x.question.includes('?')));
 assert.ok(b.get('glean-questions').children.length>=5);
 assert.equal(b.api.gleaningScore(p,b.api.state().glean).confirmed,0);
});
test('nothing guessed present, even under a different hat, until the operator marks it',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects;
 const question=b.api.gleanQuestions(p[0]).questions.find(q=>q.key==='writing');
 assert.equal(b.api.state().glean.answers[p[0].id+':writing'],undefined);
 assert.equal(b.api.recordGlean(p[0],question,'found','found pencil in box'),true);
 assert.equal(b.api.state().glean.answers[p[0].id+':writing'].status,'found');
 assert.equal(b.api.state().glean.answers[p[1].id+':writing'],undefined);
 assert.equal(b.api.gleaningScore(p,b.api.state().glean).confirmed,1);
 assert.equal(p[0].caps.length,0,'no automatic advert');
 assert.equal(b.api.state().projects.length,3,'no invented partner');
 assert.ok(b.storage.has('jarvis_spawn_018_v1'));
});
test('missing is a productive answer, not falsely counted as confirmed material',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects[2];
 b.get('glean-project').value=p.id;b.get('glean-project').events.change();
 const q=b.api.gleanQuestions(p).questions[0];
 b.api.recordGlean(p,q,'missing','not in instrument case');
 const result=b.api.gleaningScore(b.api.state().projects,b.api.state().glean);
 assert.equal(result.confirmed,0);assert.equal(result.answered,1);
 assert.match(b.get('glean-next').textContent,/smaller alternative/);
});
test('custom micro-quest is a reproducible method, but private supply observations never leave',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects[0];
 b.get('glean-custom').value='Old roll of tape';b.get('glean-hint').value='garage drawer';b.get('glean-alternative').value='folded paper';
 b.get('glean-create').click();
 const list=b.api.state().glean.custom[p.id];assert.equal(list.length,1);
 const q=b.api.gleanQuestions(p).questions.find(x=>x.label==='Old roll of tape');
 assert.ok(q);b.api.recordGlean(p,q,'found','secret private note');
 const c=b.api.cartridge(p);assert.equal(c.gleaningQuestions.length,1);
 assert.equal(c.gleaningQuestions[0].label,'Old roll of tape');
 assert.ok(b.api.validCartridge(c));
 assert.doesNotMatch(JSON.stringify(c),/secret private note|found/);
 assert.ok(b.api.validGlean(b.api.state().glean));
});
test('goal text recognizes photo workflow, musician cable test, and publishing ingredients',()=>{
 const b=browser();b.get('kind').value='other';
 const make=(title,goal)=>({type:'other',title,goal,tasks:[]});
 const photos=b.api.deriveKit(make('Photography archive','Process RAW photos'));
 assert.ok(photos.questions.some(q=>q.key==='reader'));
 const midi=b.api.deriveKit(make('Repair MIDI footswitch','Test guitar cable'));
 assert.ok(midi.questions.some(q=>q.key==='cable'));
 const news=b.api.deriveKit(make('Cedar newsletter','Publish a farm update'));
 assert.ok(news.questions.some(q=>q.key==='internet'));
});
test('malformed glean answers and private backups are rejected',()=>{
 const b=browser();b.get('seed-three').click();
 const backup=JSON.parse(JSON.stringify(b.api.state()));
 assert.ok(b.api.validBackup(backup));
 backup.glean={answers:{'bad':{status:'guessed',note:'',updatedAt:''}},custom:{}};
 assert.equal(b.api.validGlean(backup.glean),false);
 assert.equal(b.api.validBackup(backup),false);
});
