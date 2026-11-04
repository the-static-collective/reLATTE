import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const html=fs.readFileSync(new URL('./Lantern_023_Permissioned_Crossings.html',import.meta.url),'utf8');
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
 return {elements,get,api:sandbox.SPAWN_023,downloads,storage};
}
test('standalone offline, without remote dependencies, keys or sending private notes',()=>{
 assert.match(html,/<title>JAR;VIS SPAWN 023/);
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

test('proposed smallest vertical slice becomes one unfinished, observable work task on explicit click',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects[0];
 const title=b.api.deriveKit(p).slice,initial=p.tasks.length;
 b.get('glean-quest').children.at(-1).events.click();
 assert.equal(p.tasks.length,initial+1);
 assert.equal(p.tasks.at(-1).title,title);
 assert.equal(p.tasks.at(-1).state,'todo');
 assert.equal(p.tasks.at(-1).observation,'');
 b.get('glean-quest').children.at(-1).events.click();
 assert.equal(p.tasks.length,initial+1,'no duplicate slice from repeated click');
});
test('fork reproduces useful questions but never copies found inventory or observations',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects[0];
 b.get('glean-custom').value='Spare marker';b.get('glean-create').events.click();
 const custom=b.api.gleanQuestions(p).questions.find(q=>q.label==='Spare marker');
 b.api.recordGlean(p,custom,'found','a private location');
 p.tasks[0].observation='private attempt';p.tasks[0].state='done';
 const forkButton=b.get('projects').children[0].children[1].children[2];
 assert.equal(forkButton.textContent,'Fork this operation');
 forkButton.events.click();
 const copy=b.api.state().projects.at(-1);
 assert.equal(copy.parentId,p.id);
 assert.equal(copy.tasks[0].state,'todo');assert.equal(copy.tasks[0].observation,'');
 assert.equal(b.api.state().glean.custom[copy.id][0].label,'Spare marker');
 assert.equal(b.api.state().glean.answers[copy.id+':'+custom.key],undefined);
 assert.equal(copy.caps.length,0);
});

test('largest reach searches bounded 1/7/30-day catalogues, without inventing a universal maximum',()=>{
 const b=browser();b.get('seed-three').click();const p=b.api.state().projects;
 const today=b.api.composeMaximum(p,{days:1,priority:'reuse'});
 const week=b.api.composeMaximum(p,{days:7,priority:'reuse'});
 const month=b.api.composeMaximum(p,{days:30,priority:'reuse'});
 assert.ok(today.count>=3);assert.ok(week.count>today.count);assert.ok(month.count>week.count);
 assert.equal(today.ready,null);
 assert.ok(today.frontier);
 assert.ok(week.frontier);
 assert.equal(month.frontier.id,'three-network','multi-hat launch-kit is an audacious 30-day frontier, not an observed outcome');
 assert.ok(month.frontier.gaps.length>0);
 assert.match(b.get('max-ready').textContent+b.get('max-ready').children.map(x=>x.textContent).join(''),/LARGEST STARTABLE PROOF|Not established/);
});
test('largest startable is restricted to verified local inputs and excludes external authority gates',()=>{
 const b=browser();b.get('seed-three').click();
 const gather=b.api.state().projects[0];
 const needed=['writing','details','time','space','labels'];
 for(const key of needed)b.api.recordGlean(gather,{key},'found','checked personally');
 const result=b.api.composeMaximum([gather],{days:7,priority:'reach'});
 assert.ok(result.ready);
 assert.equal(result.ready.id,gather.id+'-runbook');
 assert.equal(result.frontier.external,true);
 assert.ok(result.frontier.reportedReady,'the named resources are reported but real-world authorization remains separate');
 assert.notEqual(result.ready.id,result.frontier.id,'external action must not be labeled startable');
});
test('unanswered, missing and found-in-another-hat cannot falsely be counted as this action ready',()=>{
 const b=browser();b.get('seed-three').click();
 const [g,grow,art]=b.api.state().projects;
 b.api.recordGlean(art,{key:'writing'},'found','art pencil');
 b.api.recordGlean(g,{key:'writing'},'missing','cannot find it');
 const gather=b.api.composeMaximum([g,grow,art],{days:1,priority:'reuse'}).ranked.find(x=>x.id===g.id+'-runbook');
 const req=gather.resources.find(x=>x.key==='writing');
 assert.equal(req.status,'reuse-check');
 assert.equal(gather.reportedReady,false);
 assert.ok(gather.gaps.some(x=>x.key==='writing'));
});
test('priority changes choose different largest frontiers with explicit scoring',()=>{
 const b=browser();b.get('seed-three').click();
 const ps=b.api.state().projects;
 const reach=b.api.composeMaximum(ps,{days:30,priority:'reach'});
 const reuse=b.api.composeMaximum(ps,{days:30,priority:'reuse'});
 assert.equal(reach.frontier.id,'three-network');
 assert.equal(reuse.frontier.id,'three-network');
 assert.ok(reach.frontier.score>0&&reuse.frontier.score>0);
 assert.equal(b.api.maximumCandidates(ps,{days:1}).some(x=>x.slug==='three-network'),false);
});
test('operator-defined ambitious direction stages a falsifiable artifact, never invites imaginary people',()=>{
 const b=browser();b.get('seed-three').click();
 const p=b.api.state().projects[0];
 const plan=b.api.composeMaximum(b.api.state().projects,{days:7,vision:'Build a system where neighbors reuse what already exists'});
 const aspirational=plan.ranked.find(x=>x.id==='user-vision');
 assert.ok(aspirational);
 assert.match(aspirational.proof,/single-user proof/);
 const originalCount=p.tasks.length;
 const staged=b.api.stageMaximum(aspirational);
 assert.equal(staged.ok,true);
 assert.equal(p.tasks.length,originalCount+1);
 const task=p.tasks.at(-1);
 assert.equal(task.state,'todo');assert.equal(task.observation,'');
 assert.match(task.title,/single-user proof/);
 assert.equal(b.api.stageMaximum(aspirational).ok,false,'no repeated circular stage task');
 assert.equal(b.api.state().projects.length,3);
});
test('frontier gap seeking records an actual reply in local gleaning inventory without public posting',()=>{
 const b=browser();b.get('seed-three').click();
 const from=b.api.composeMaximum(b.api.state().projects,{days:7});
 assert.ok(from.frontier.gaps.length>0);
 const q=b.get('max-question');
 assert.ok(q.children.some(x=>x.textContent==='ONE QUESTION TO OPEN THE NEXT HORIZON'));
 const buttons=q.children.at(-1);
 assert.ok(buttons.children.some(x=>x.textContent==='Go look'));
 buttons.children.find(x=>x.textContent==='Go look').events.click();
 const qs=Object.values(b.api.state().glean.answers);
 assert.equal(qs.length,1);
 assert.equal(qs[0].status,'check');
 assert.equal(b.api.gleaningScore(b.api.state().projects,b.api.state().glean).confirmed,0);
});
test('one-page frontier brief is a local generated artifact, not externally published',()=>{
 const b=browser();b.get('seed-three').click();
 const front=b.get('max-frontier');
 const action=front.children.find(x=>x.textContent==='Download a one-page frontier brief');
 assert.ok(action);
 const before=b.downloads.length;
 action.events.click();
 assert.equal(b.downloads.length,before+1);
 assert.match(b.get('max-status').textContent,/printable frontier brief/);
});
test('scope is real: one hat cannot claim all-hat cooperative action',()=>{
 const b=browser();b.get('seed-three').click();
 const p=b.api.state().projects;
 const all=b.api.composeMaximum(p,{days:30});
 const single=b.api.composeMaximum([p[0]],{days:30});
 assert.ok(all.ranked.some(x=>x.id==='three-network'));
 assert.ok(!single.ranked.some(x=>x.id==='three-network'));
 assert.ok(single.ranked.every(x=>x.projects.length===1));
});

test('imagination generates multiple mechanisms outside the finite maximum-action catalogue',()=>{
 const b=browser();b.get('seed-three').click();
 const actual=b.api.state().projects;
 const max=b.api.maximumCandidates(actual,{days:30});
 const ideas=b.api.imagineWorlds(actual,{mode:'surprising',priority:'bridges'});
 assert.ok(ideas.total>max.length,'compositional engine explores beyond fixed action library');
 assert.ok(ideas.total>=20,'three hats generate meaningful recombinations');
 assert.ok(new Set(ideas.ideas.map(i=>i.id)).size===ideas.ideas.length);
 assert.ok(ideas.ideas.some(i=>i.lens==='mirror'),'counterfactual one-person tabletop simulation');
 assert.ok(ideas.ideas.some(i=>i.lens==='relay'),'one output as the input of another');
 assert.ok(ideas.ideas.some(i=>i.lens==='multiply'),'replication without promised people');
 assert.ok(ideas.ideas.some(i=>i.lens==='piggyback'),'speculative event permission gate');
 assert.ok(ideas.ideas.every(i=>i.projects.length>=1&&i.firstTest.length>10&&i.refute.length>10));
});
test('every idea has provenance, a disconfirming observation and explicit unresolved requirements',()=>{
 const b=browser();b.get('seed-three').click();
 const all=b.api.imagineWorlds(b.api.state().projects,{mode:'wild'}).ideas;
 assert.ok(all.length>=20);
 for(const idea of all){
  assert.ok(idea.origin.length>4&&idea.why.length>4);
  assert.ok(idea.assumptions.length>=1&&idea.assumptions.length<=5);
  assert.ok(idea.refute);
  assert.equal(idea.found,0,'no input was pre-certified');
  assert.equal(idea.gaps.length,idea.resources.length);
  assert.ok(idea.projects.every(p=>b.api.state().projects.includes(p)));
  assert.ok(idea.firstTest.length<=180,'stageable first test');
 }
 assert.equal(b.api.state().projects.reduce((n,p)=>n+p.tasks.filter(t=>t.state==='done').length,0),0);
});
test('one-person only returns single-role experiments; it does not invent partners',()=>{
 const b=browser();b.get('seed-three').click();
 const p=b.api.state().projects[0];
 const result=b.api.imagineWorlds([p],{mode:'wild'});
 assert.ok(result.total>=4);
 assert.ok(result.ideas.every(i=>i.projects.length===1));
 assert.ok(!result.ideas.some(i=>i.origin.includes('two hats')||i.lens==='relay'));
});
test('reported resources change visibility of gaps but never validate impact or permission',()=>{
 const b=browser();b.get('seed-three').click();
 const ps=b.api.state().projects;
 const target=b.api.imagineWorlds(ps,{mode:'grounded'}).ideas.find(i=>i.id==='im:'+ps[0].id+':reverse');
 assert.ok(target&&target.gaps.length>=2);
 b.api.recordGlean(ps[0],{key:'writing'},'found','actually checked paper drawer');
 const updated=b.api.imagineWorlds(ps,{mode:'grounded'}).ideas.find(i=>i.id===target.id);
 assert.equal(updated.found,1);
 assert.ok(updated.gaps.length>=1);
 assert.equal(ps[0].caps.length,0);
 const outside=b.api.imagineWorlds(ps,{mode:'surprising'}).ideas.find(i=>i.lens==='piggyback');
 assert.equal(outside.external,true,'no event permissions can be inferred from resources');
});
test('blocked tasks become novel diagnostic seeds instead of being silently declared achieved',()=>{
 const b=browser();b.get('seed-three').click();
 const p=b.api.state().projects[0],t=p.tasks[0];
 t.state='blocked';t.observation='cannot access the venue yet';
 const ideas=b.api.imagineWorlds(b.api.state().projects,{mode:'surprising'}).ideas;
 const blocked=ideas.find(i=>i.id==='im:blocked:'+p.id+':'+t.id);
 assert.ok(blocked);
 assert.match(blocked.firstTest,/exact reason/);
 assert.match(blocked.refute,/preserve the block/);
 assert.equal(t.state,'blocked');
});
test('recorded offer/need category overlap becomes hypothesis, never an actual transaction',()=>{
 const b=browser();b.get('seed-three').click();
 const ps=b.api.state().projects;
 ps[0].caps.push({id:'one',direction:'need',category:'food',detail:'one tray for gathering'});
 ps[1].caps.push({id:'two',direction:'offer',category:'food',detail:'one inspected basket'});
 const ideas=b.api.imagineWorlds(ps,{mode:'surprising'}).ideas;
 const match=ideas.find(i=>i.id==='im:match:two:one');
 assert.ok(match);
 assert.match(match.why,/fit is not yet established/);
 assert.equal(ps[1].caps[0].direction,'offer');
 assert.equal(ps[0].caps[0].direction,'need');
});
test('user-authored wild vision and counterfactual remain explicitly unverified',()=>{
 const b=browser();b.get('seed-three').click();
 const ps=b.api.state().projects;
 const question='What if no one needs to buy food because we reuse the harvest?';
 const plan=b.api.imagineWorlds(ps,{mode:'wild',whatif:question,northstar:'A self-reproducing village workshop'});
 const hypothetical=plan.ideas.find(i=>i.lens==='whatif');
 const north=plan.ideas.find(i=>i.id==='im:north:'+ps[0].id);
 assert.ok(hypothetical&&north);
 assert.match(hypothetical.name,/What if no one needs/);
 assert.match(hypothetical.assumptions.join(' '),/counterfactual/);
 assert.match(north.refute,/no observable difference/);
 assert.equal(hypothetical.found,0);
});
test('three counterfactual forks remove dependency, make a method and reverse exchange',()=>{
 const b=browser();b.get('seed-three').click();
 const plan=b.api.imagineWorlds(b.api.state().projects,{mode:'wild'});
 const origin=plan.ideas.find(x=>x.lens==='relay');
 const forks=b.api.imagineForks(origin);
 assert.equal(forks.length,3);
 assert.equal(new Set(forks.map(i=>i.id)).size,3);
 assert.ok(forks.every(x=>x.projectId===origin.projectId&&x.projects.length===origin.projects.length));
 assert.ok(forks.every(x=>x.assumptions.length>0&&x.refute&&x.firstTest.length>15));
 assert.ok(forks.some(x=>x.lens==='subtract'));
 assert.ok(forks.some(x=>x.lens==='multiply'));
 assert.ok(forks.some(x=>x.lens==='reverse'));
});
test('staging a dream creates only an unfinished physical proof; duplicate staging refused',()=>{
 const b=browser();b.get('seed-three').click();
 const ps=b.api.state().projects;
 const dream=b.api.imagineWorlds(ps,{mode:'surprising'}).ideas[0];
 const op=ps.find(x=>x.id===dream.projectId),before=op.tasks.length;
 assert.equal(b.api.stageImagination(dream).ok,true);
 assert.equal(op.tasks.length,before+1);
 assert.equal(op.tasks.at(-1).state,'todo');
 assert.equal(op.tasks.at(-1).observation,'');
 assert.equal(b.api.stageImagination(dream).ok,false);
 assert.equal(op.tasks.length,before+1);
 assert.equal(ps.length,3);
});
test('UI changes batches without creating resources; expands and downloads an explicit idea card',()=>{
 const b=browser();b.get('seed-three').click();
 const first=b.get('im-results').children[1].children[1].textContent;
 b.get('im-more').click();
 const next=b.get('im-results').children[1].children[1].textContent;
 assert.notEqual(first,next);
 const firstCard=b.get('im-results').children[1];
 const acts=firstCard.children.at(-1);
 assert.ok(acts.children.some(x=>x.textContent==='Expand this possibility'));
 acts.children.find(x=>x.textContent==='Expand this possibility').click();
 assert.ok(b.get('im-forks').children.length>=5);
 const before=b.downloads.length;
 acts.children.find(x=>x.textContent==='Download hypothesis').click();
 assert.equal(b.downloads.length,before+1);
 assert.equal(b.api.gleaningScore(b.api.state().projects,b.api.state().glean).confirmed,0);
 assert.ok(b.api.state().projects.every(p=>p.tasks.every(x=>x.state==='todo')));
});
test('empty workbench has no imaginary projects or proposed world',()=>{
 const b=browser();
 const result=b.api.imagineWorlds([],{mode:'wild'});
 assert.equal(result.total,0);
 assert.equal(result.ideas.length,0);
 assert.equal(b.api.state().projects.length,0);
});

test('a generated possibility can be captured as an unfinished evidence-linked trial, not an outcome',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const idea=b.api.imagineWorlds(ps,{mode:'surprising'}).ideas[0];const p=ps.find(x=>x.id===idea.projectId),before=p.tasks.length;
 const saved=b.api.captureTrial(idea);
 assert.equal(saved.ok,true);
 assert.equal(p.tasks.length,before+1);
 assert.equal(p.tasks.at(-1).state,'todo');
 const t=b.api.state().learning.trials[0];assert.equal(t.ideaId,idea.id);
 assert.equal(t.taskId,p.tasks.at(-1).id);assert.equal(t.status,'draft');
 assert.equal(t.observation,'');assert.equal(t.lesson,'');
 assert.equal(b.api.captureTrial(idea).ok,false,'no double-counted same hypothesis');
 assert.equal(b.api.learnedLensWeight(idea.lens),0,'clicks are not evidence');
 assert.equal(b.api.validLearning(b.api.state().learning),true);
});
test('an invented success cannot be recorded unless a linked real task has a completed observation',()=>{
 const b=browser();b.get('seed-three').click();const idea=b.api.imagineWorlds(b.api.state().projects,{mode:'grounded'}).ideas[0];
 b.api.captureTrial(idea);const t=b.api.state().learning.trials[0];
 const evidence='I tried making the two cards and the exchange was actually usable.';
 assert.equal(b.api.recordTrial(t.id,'worked',evidence,'Repeat with two roles').ok,false);
 const p=b.api.state().projects.find(p=>p.id===t.projectId),task=p.tasks.find(x=>x.id===t.taskId);
 task.state='done';task.observation='I completed a real attempt and observed it.';
 assert.equal(b.api.recordTrial(t.id,'worked','too short','Repeat with two roles').ok,false);
 const done=b.api.recordTrial(t.id,'worked',evidence,'Repeat with two roles');
 assert.equal(done.ok,true);
 assert.equal(t.status,'worked');assert.equal(b.api.learnedLensWeight(t.lens),3);
 task.state='todo';assert.equal(b.api.learnedLensWeight(t.lens),0,'reverted task cannot remain ranked as reported success');
});
test('failed trials require a blocked task and lower subsequent ranks for that lens',()=>{
 const b=browser();b.get('seed-three').click();
 const idea=b.api.imagineWorlds(b.api.state().projects,{mode:'surprising'}).ideas[0];
 b.api.captureTrial(idea);const t=b.api.state().learning.trials[0];
 const op=b.api.state().projects.find(p=>p.id===t.projectId),task=op.tasks.find(x=>x.id===t.taskId);
 task.state='done';task.observation='I tried this with real notes and it did not fit.';
 assert.equal(b.api.recordTrial(t.id,'failed','This real attempt failed for a known material reason.','Try another resource').ok,false);
 task.state='blocked';
 const result=b.api.recordTrial(t.id,'failed','This real attempt failed for a known material reason.','Try another resource');
 assert.equal(result.ok,true);assert.equal(b.api.learnedLensWeight(t.lens),-4);
 const newPlan=b.api.imagineWorlds(b.api.state().projects,{mode:'surprising'}).ideas.find(i=>i.id===idea.id);
 assert.ok(newPlan);
});
test('operator can teach a plain-text one-hat move without supplying any evidence',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const result=b.api.addLearningRule({mode:'single',sourceTrialId:'',name:'Wrap {{A}} in a one-card instruction',firstTest:'Write one clear instruction from {{A}} and try it on paper.',refute:'Cannot follow the instructions without the original author.',needs:['writing','time']});
 assert.equal(result.ok,true);
 const rule=result.rule;assert.equal(rule.sourceTrialId,'');assert.equal(rule.enabled,true);
 const ideas=b.api.learnedRuleCandidates(ps);
 assert.equal(ideas.length,3);
 assert.ok(ideas.every(x=>x.projects.length===1&&x.lens==='learned'));
 assert.ok(ideas.some(x=>x.name.includes(ps[0].title)));
 assert.ok(ideas.every(x=>x.origin.includes('no successful trial yet')));
 const generated=b.api.imagineWorlds(ps,{mode:'surprising'}).ideas.filter(x=>x.lens==='learned');
 assert.equal(generated.length,3);
 assert.ok(generated.every(x=>x.gaps.length>0),'new rule creates no verified material');
});
test('two/three-role templates make reproducible recombinations; missing slots cannot be added',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 assert.equal(b.api.addLearningRule({mode:'triple',name:'Combine {{A}} and {{B}}',firstTest:'Make a real card for {{A}} and {{B}}.',refute:'No usable handoff was observed.',needs:['writing']}).ok,false);
 const created=b.api.addLearningRule({mode:'triple',name:'Braid {{A}}, {{B}}, and {{C}}',firstTest:'Make one card from {{A}}, another from {{B}}, and actually trial an input for {{C}}.',refute:'The real input is incompatible.',needs:['writing','time']});
 assert.equal(created.ok,true);assert.equal(b.api.learnedRuleCandidates(ps).length,1);
 assert.ok(b.api.learnedRuleCandidates([ps[0],ps[1]]).length===0);
 assert.equal(b.api.addLearningRule({mode:'single',name:'{{A}} and {{X}}',firstTest:'Try one paper mockup using {{A}}.',refute:'The mockup does not work.',needs:['writing']}).ok,false);
});
test('evidence-backed recipe requires one genuinely completed worked trial; failed lessons cannot silently endorse it',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const idea=b.api.imagineWorlds(ps,{mode:'grounded'}).ideas[0];
 b.api.captureTrial(idea);const t=b.api.state().learning.trials[0];
 const recipe={mode:'pair',sourceTrialId:t.id,name:'Turn {{A}} into an experiment for {{B}}',firstTest:'Make one material exchange card from {{A}} for {{B}} and check fit.',refute:'The receiving side cannot use it.',needs:['writing']};
 assert.equal(b.api.addLearningRule(recipe).ok,false);
 const task=ps.find(p=>p.id===t.projectId).tasks.find(x=>x.id===t.taskId);
 task.state='done';task.observation='I carried out this test and inspected the result.';
 b.api.recordTrial(t.id,'worked','The controlled task produced one usable card of this method.','Try it in another role');
 const made=b.api.addLearningRule(recipe);assert.equal(made.ok,true);
 assert.ok(b.api.learnedRuleCandidates(ps).every(x=>x.origin.includes('supported by one self-report')));
 task.state='todo';
 assert.ok(b.api.learnedRuleCandidates(ps).every(x=>x.origin.includes('no successful trial yet')),'evidence support remains conditional');
});
test('learning data validation prevents malformed backups and oversize transformations',()=>{
 const b=browser();b.get('seed-three').click();
 assert.equal(b.api.validLearning({trials:[],rules:[]}),true);
 assert.equal(b.api.validLearning({trials:[],rules:[{enabled:true,mode:'pair'}]}),false);
 const backup=JSON.parse(JSON.stringify(b.api.state()));
 assert.equal(b.api.validBackup(backup),true);
 backup.learning={trials:[{id:'oops'}],rules:[]};
 assert.equal(b.api.validBackup(backup),false);
 assert.equal(b.api.addLearningRule({mode:'pair',name:'A'.repeat(146),firstTest:'Try {{A}} with {{B}} on paper.',refute:'The test does not work.',needs:['writing']}).ok,false);
});
test('learning ledger UI exposes task-bound evidence and user review without automatic rewards',()=>{
 const b=browser();b.get('seed-three').click();const idea=b.api.imagineWorlds(b.api.state().projects,{mode:'grounded'}).ideas[0];
 const card=b.get('im-results').children[1],actions=card.children.at(-1);
 const launch=actions.children.find(c=>c.textContent==='Run + observe this hypothesis');
 assert.ok(launch);
 launch.events.click();
 assert.equal(b.api.state().learning.trials.length,1);
 assert.match(b.get('learn-count').textContent,/1 experiments captured/);
 assert.ok(b.get('learn-trials').children.length===1);
 assert.equal(b.api.state().learning.trials[0].status,'draft');
 assert.equal(b.api.state().projects.flatMap(p=>p.tasks).filter(t=>t.state==='done').length,0);
});

test('a real failed experiment proposes a new but untested counter-rule without inventing success',()=>{
 const b=browser();b.get('seed-three').click();
 const idea=b.api.imagineWorlds(b.api.state().projects,{mode:'grounded'}).ideas[0];
 b.api.captureTrial(idea);const t=b.api.state().learning.trials[0];
 assert.equal(b.api.suggestNextRule(t.id).ok,false,'no hypothesis mutation before a real trial');
 const p=b.api.state().projects.find(p=>p.id===t.projectId);
 const task=p.tasks.find(x=>x.id===t.taskId);
 task.state='blocked';task.observation='Tested a paper exchange; item was unavailable';
 const marked=b.api.recordTrial(t.id,'failed','I tried the exchange and the requested item was missing in the actual test.','Remove the missing supply');
 assert.equal(marked.ok,true);
 const suggestion=b.api.suggestNextRule(t.id);
 assert.equal(suggestion.ok,true);
 assert.equal(suggestion.mode,'single');
 assert.equal(suggestion.sourceTrialId,'','a failed trial is not a confirmed positive rule source');
 assert.match(suggestion.firstTest,/reversible/);
 assert.match(suggestion.reason,/UNTESTED/);
 assert.equal(b.api.state().learning.rules.length,0,'suggestion does not self-install');
 const newRule=b.api.addLearningRule(suggestion);
 assert.equal(newRule.ok,true,'operator may explicitly accept a tested counterfactual, still a hypothesis');
 assert.ok(b.api.learnedRuleCandidates(b.api.state().projects).every(x=>x.origin.includes('no successful trial yet')));
});
test('a successful test offers a differently situated follow-on rule with task-bound provenance',()=>{
 const b=browser();b.get('seed-three').click();
 const idea=b.api.imagineWorlds(b.api.state().projects,{mode:'grounded'}).ideas[0];
 b.api.captureTrial(idea);const trial=b.api.state().learning.trials[0];
 const task=b.api.state().projects.find(p=>p.id===trial.projectId).tasks.find(x=>x.id===trial.taskId);
 task.state='done';task.observation='Actual paper cards created and matched';
 b.api.recordTrial(trial.id,'worked','I used two cards and there was an actual demonstrable fit.','Test portability with the other hat');
 const suggestion=b.api.suggestNextRule(trial.id);
 assert.equal(suggestion.ok,true);
 assert.equal(suggestion.mode,'pair');
 assert.equal(suggestion.sourceTrialId,trial.id);
 assert.match(suggestion.name,/\{\{B\}\}/);
 assert.equal(b.api.state().learning.rules.length,0);
});

test('four world forks share one-person inputs but keep independent virtual turns and parents',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const made=b.api.createWorldFamily(ps,'Build a one-person portable cooperative',false);
 assert.equal(made.ok,true);
 assert.equal(made.forks.length,4);
 assert.equal(new Set(made.forks.map(w=>w.groupId)).size,1);
 assert.equal(new Set(made.forks.map(w=>w.id)).size,4);
 assert.deepEqual([...made.forks.map(w=>w.blueprint.strategy)].sort(),['autonomy','cooperation','efficiency','generosity'].sort());
 assert.ok(made.forks.every(w=>w.blueprint.roles.length===3&&w.sim.turn===0&&w.sim.artifacts===0));
 assert.ok(made.forks.every(w=>Object.values(w.blueprint.inputs).every(x=>x==='unknown')));
 assert.ok(b.api.validWorldState(b.api.state().worlds));
});
test('no virtual action can fabricate physical supplies, real people or observed completions',()=>{
 const b=browser();b.get('seed-three').click();
 const created=b.api.createWorldFamily(b.api.state().projects,'One operator with multiple small systems');
 const fork=created.forks[0];
 const before=JSON.stringify(b.api.state().projects.map(p=>p.tasks));
 const result=b.api.worldStep(fork.id);
 assert.equal(result.ok,true);
 assert.equal(result.action,'inspect');
 assert.equal(fork.sim.questions,1);
 assert.equal(fork.sim.artifacts,0);
 assert.equal(fork.blueprint.inputs.writing,'unknown','inspecting does not make resources appear');
 assert.equal(JSON.stringify(b.api.state().projects.map(p=>p.tasks)),before,'virtual step never marks real tasks done');
 assert.equal(b.api.state().learning.trials.length,0,'virtual step is not a genuine observation');
});
test('same checked resources propagate to every variant and invalidate old synthetic comparisons',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 const family=b.api.createWorldFamily(ps,'Develop a one-person cooperation kit').forks;
 for(const key of ['writing','time'])assert.equal(b.api.worldSetInput(family[0].id,key,'found').ok,true);
 const report=b.api.runWorldComparison(family[0].id,5);
 assert.equal(report.ok,true);assert.equal(report.results.length,4);
 assert.ok(report.results.every(x=>x.turns>0));
 assert.ok(family.some(w=>w.sim.artifacts>0));
 assert.equal(new Set(family.map(w=>JSON.stringify(w.blueprint.inputs))).size,1,'all compared worlds share same inputs');
 const changed=b.api.worldSetInput(family[1].id,'writing','missing');
 assert.equal(changed.ok,true);
 assert.ok(family.every(w=>w.sim.turn===0&&w.sim.artifacts===0&&w.sim.bridges===0));
 assert.ok(family.every(w=>w.blueprint.inputs.writing==='missing'));
 assert.equal(ps.flatMap(p=>p.tasks).some(t=>t.state==='done'),false);
});
test('forking branches method rather than copying its virtual events or increasing real participants',()=>{
 const b=browser();b.get('seed-three').click();const initial=b.api.createWorldFamily(b.api.state().projects,'Portable independent cooperation');
 const base=initial.forks[0];b.api.worldStep(base.id);
 const sourceTurn=base.sim.turn;
 const copy=b.api.worldFork(base.id,'autonomy');
 assert.equal(copy.ok,true);
 assert.equal(copy.world.parentId,base.id);assert.equal(copy.world.groupId,base.groupId);
 assert.equal(copy.world.revision,2);assert.equal(copy.world.blueprint.strategy,'autonomy');
 assert.equal(copy.world.sim.turn,0);assert.equal(copy.world.sim.history.length,0);
 assert.equal(base.sim.turn,sourceTurn);assert.equal(b.api.state().projects.length,3);
});
test('portable blueprint is privacy-safe and does not export inventory sightings or trial observations',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 b.api.recordGlean(ps[0],{key:'writing'},'found','SECRET PRIVATE STORAGE NOTE');
 const family=b.api.createWorldFamily(ps,'Cooperative within safe local boundaries',true).forks;
 assert.equal(family[0].blueprint.inputs.writing,'found');
 const source=family[0];const bp=b.api.worldBlueprint(ps,'Reusable cooperative protocol','cooperation',{writing:'found',time:'missing'});
 assert.equal(b.api.validWorldBlueprint(bp),true);
 const portable=b.api.portableWorldHtml(source);
 assert.doesNotMatch(portable,/SECRET PRIVATE STORAGE NOTE/);
 const exported=JSON.stringify(JSON.parse(portable.match(/const blueprint=(\{.*?\});\n/)[1]));
 assert.doesNotMatch(exported,/"found"|"missing"/,'public executable begins with unknown resources');
 assert.doesNotMatch(portable,new RegExp(ps[0].id),'all internal operation IDs stripped');
 assert.doesNotMatch(portable,/\/functions\/v1\/|supabase.co|githubraw.com/);
 assert.equal((portable.match(/<script>/g)||[]).length,1);
 assert.equal((portable.match(/<\/script>/g)||[]).length,1);
 assert.equal(b.api.validWorldBlueprint(JSON.parse(JSON.stringify(bp))),true);
});
test('JSON cartridge import rejects untrusted schema/code and resets material statuses',()=>{
 const b=browser();b.get('seed-three').click();
 const bp=b.api.worldBlueprint(b.api.state().projects,'A transferable one-person world','efficiency',{writing:'found',time:'found'});
 assert.equal(b.api.importWorld(JSON.stringify({...bp,schema:'evil/world-script'})).ok,false);
 assert.equal(b.api.importWorld(JSON.stringify({...bp,evilCode:'fetch("bad")'})).ok,false);
 assert.equal(b.api.importWorld(JSON.stringify({...bp,roles:['unknown-type']})).ok,false);
 assert.equal(b.api.importWorld(JSON.stringify({...bp,inputs:{...bp.inputs,secret:'found'}})).ok,false);
 const imported=b.api.importWorld(JSON.stringify(bp));
 assert.equal(imported.ok,true);
 assert.ok(Object.values(imported.world.blueprint.inputs).every(v=>v==='unknown'));
 assert.equal(imported.world.sim.turn,0);
 assert.equal(b.api.state().worlds.forks.length,1);
});
test('playable HTML cartridge actually runs an offline virtual turn with human-assigned inputs',()=>{
 const b=browser();b.get('seed-three').click();
 const w=b.api.createWorldFamily(b.api.state().projects,'Test a portable one-person world').forks[0];
 const html=b.api.portableWorldHtml(w);
 assert.match(html,/Playable World Cartridge/);
 assert.doesNotMatch(html,/<script[^>]+src=|\bfetch\s*\(|XMLHttpRequest|WebSocket/i);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(js);
 const elements=new Map();
 function get(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)}
 const document={getElementById:get,createElement:t=>new Element(t),body:new Element('body')};
 const sandbox={document,Blob,URL:{createObjectURL:()=> 'blob:world',revokeObjectURL(){}},setTimeout:()=>{},console};
 new vm.Script(js,{filename:'playable-world-cartridge.js'}).runInNewContext(sandbox);
 assert.match(get('stats').textContent,/SIMULATED turns: 0/);
 get('step').click();
 assert.match(get('stats').textContent,/SIMULATED turns: 1/);
 assert.match(get('log').children[0].textContent,/QUESTION ONLY/);
 const firstSelect=get('inputs').children.find(row=>row.children[0].textContent.includes('writing')).children[1];
 firstSelect.value='found';firstSelect.events.change();
 assert.match(get('stats').textContent,/SIMULATED turns: 0/,'changing input resets simulation');
 assert.match(get('status').textContent,/No real resources changed/);
});
test('hostile goal stays text inside the portable cartridge script, never breaks out',()=>{
 const b=browser();b.get('seed-three').click();const goal='Use </script><script>unsafe()</script> as literal text only';
 const made=b.api.createWorldFamily(b.api.state().projects,goal);
 assert.equal(made.ok,true);
 const html=b.api.portableWorldHtml(made.forks[0]);
 assert.equal((html.match(/<script>/g)||[]).length,1);
 assert.equal((html.match(/<\/script>/g)||[]).length,1);
 assert.doesNotMatch(html,/<script>unsafe\(\)<\/script>/);
 assert.match(html,/\\u003c/,'goal script delimiters are escaped in JS data');
});
test('simulation fields are isolated from real trial evidence and can only stage a TODO',()=>{
 const b=browser();b.get('seed-three').click();const family=b.api.createWorldFamily(b.api.state().projects,'A reproducible virtual trial').forks;
 b.api.worldSetInput(family[0].id,'writing','found');b.api.worldSetInput(family[0].id,'time','found');
 b.api.runWorldComparison(family[0].id);
 assert.ok(family.some(x=>x.sim.artifacts>0));
 assert.equal(b.api.state().learning.trials.length,0);
 const staged=b.api.stageWorldFieldTest(family[0].id);
 assert.equal(staged.ok,true);
 assert.equal(b.api.state().learning.trials.length,1);
 const trial=b.api.state().learning.trials[0];
 const linked=b.api.state().projects.flatMap(x=>x.tasks).find(x=>x.id===trial.taskId);
 assert.equal(linked.state,'todo');assert.equal(linked.observation,'');
 assert.equal(b.api.recordTrial(trial.id,'worked','I claim this worked, but it was a virtual run only.','Claim a result').ok,false);
 assert.equal(b.api.stageWorldFieldTest(family[0].id).ok,false,'the same world cannot be staged twice');
});
test('backup validates bounded world forks and imported versions do not copy their virtual history',()=>{
 const b=browser();b.get('seed-three').click();const family=b.api.createWorldFamily(b.api.state().projects,'Portable cooperative practice').forks;
 b.api.worldStep(family[0].id);
 const backup=JSON.parse(JSON.stringify(b.api.state()));
 assert.equal(b.api.validBackup(backup),true);
 assert.equal(b.api.validWorldState(backup.worlds),true);
 backup.worlds.forks[0].sim.turn=500;
 assert.equal(b.api.validBackup(backup),false);
 const valid=b.api.worldBlueprint(b.api.state().projects,'One-person working world','generosity');
 assert.equal(b.api.validWorldBlueprint({...valid,strategy:'invented-machinery'}),false);
});

function cartridgeClient(markup){
 const found=markup.match(/<script>([\s\S]*?)<\/script>/);assert.ok(found);
 const elements=new Map(),downloads=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
 const doc={getElementById:get,createElement:tag=>new Element(tag),body:new Element('body')};
 const sandbox={document:doc,crypto:webcrypto,TextEncoder,Uint8Array,Blob,btoa,atob,Date,JSON,Array,Object,String,Set,URL:{
  createObjectURL:()=>{downloads.push('blob');return 'blob:test'},revokeObjectURL(){}},setTimeout:()=>{},console};
 new vm.Script(found[1],{filename:'relatte-crossing-cartridge.js'}).runInNewContext(sandbox);
 return {api:sandbox.RELATTE_CROSSING_023,get,downloads};
}
test('standalone cartridge now executes the reLATTE crossing desk with no external network dependencies',()=>{
 const b=browser();b.get('seed-three').click();
 const w=b.api.createWorldFamily(b.api.state().projects,'A shareable one-person social experiment').forks[0];
 const html=b.api.portableWorldHtml(w);
 assert.match(html,/reLATTE · Permissioned crossing/);
 assert.match(html,/Sign OFFER packet/);
 assert.match(html,/Sign provider decision/);
 assert.equal((html.match(/<script>/g)||[]).length,1);
 assert.equal((html.match(/<\/script>/g)||[]).length,1);
 assert.doesNotMatch(html,/<script[^>]+src=|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
 const sample=cartridgeClient(html);
 assert.ok(sample.api);
 assert.equal(sample.api.ledger().hasKey,false);
 assert.equal(sample.api.ledger().localOffer,null);
});
test('two independent cartridges establish one scoped two-party signed crossing and a nondelivery acknowledgment',async()=>{
 const b=browser();b.get('seed-three').click();const worlds=b.api.createWorldFamily(b.api.state().projects,'A portable pilot with consented material use').forks;
 const A=cartridgeClient(b.api.portableWorldHtml(worlds[0]));
 const B=cartridgeClient(b.api.portableWorldHtml(worlds[1]));
 const identA=await A.api.makeIdentity(),identB=await B.api.makeIdentity();
 assert.notEqual(identA.fingerprint,identB.fingerprint);
 await assert.rejects(A.api.makeOffer({category:'tools',label:'One usable spare MIDI adapter',quantity:1,scope:'test',consent:false}),/EXPLICIT_OFFER_CONSENT_REQUIRED/);
 const offer=await A.api.makeOffer({category:'tools',label:'One usable spare MIDI adapter',quantity:1,scope:'test',consent:true});
 assert.equal(offer.kind,'OFFER');assert.equal(offer.body.scope,'test');
 assert.ok(!Object.hasOwn(offer.issuer,'d'),'private signing key never leaves local page');
 assert.equal(offer.issuer.kty,'EC');assert.equal(offer.issuer.crv,'P-256');
 const verified=await B.api.importPacket(JSON.stringify(offer));assert.equal(verified.kind,'OFFER');
 assert.match(verified.notice,/UNVERIFIED/);
 await assert.rejects(B.api.makeInterest({reason:'I can test this adapter safely on my device.',consent:false}),/EXPLICIT_INTEREST_CONSENT_REQUIRED/);
 const interest=await B.api.makeInterest({reason:'I can test this adapter safely on my device.',consent:true});
 assert.equal(interest.link.offerId,offer.id);
 assert.equal((await A.api.importPacket(JSON.stringify(interest))).kind,'INTEREST');
 const decision=await A.api.makeDecision('ADMIT');
 assert.equal(decision.body.decision,'ADMIT');
 const admitted=await B.api.importPacket(JSON.stringify(decision));
 assert.equal(admitted.kind,'DECISION');assert.match(admitted.notice,/NO physical delivery/);
 const ack=await B.api.makeAck();assert.equal(ack.body.status,'SEEN_NOT_DELIVERED');
 const done=await A.api.importPacket(JSON.stringify(ack));
 assert.equal(done.kind,'ACK');
 assert.match(done.notice,/NO goods/);
 assert.equal(A.api.ledger().remoteAck,ack.id);
 assert.equal(A.api.ledger().localDecision,'ADMIT');
 assert.equal(B.api.ledger().remoteDecision,'ADMIT');
 assert.ok(!Object.values(A.api.ledger()).some(x=>x==='DELIVERED'));
 assert.equal(b.api.state().learning.trials.length,0,'handshake not counted as physical observed work');
});
test('tampering, changing scope, wrong actor and forged links are rejected',async()=>{
 const b=browser();b.get('seed-three').click();const w=b.api.createWorldFamily(b.api.state().projects,'An independent trusted-by-key pilot').forks[0];
 const html=b.api.portableWorldHtml(w),A=cartridgeClient(html),B=cartridgeClient(html),C=cartridgeClient(html);
 const offer=await A.api.makeOffer({category:'method',label:'Repeatable hand-drawn inventory method',quantity:1,scope:'copy',consent:true});
 const edited=JSON.parse(JSON.stringify(offer));edited.body.scope='test';
 await assert.rejects(B.api.importPacket(JSON.stringify(edited)),/SIGNATURE_MISMATCH/);
 const forged=JSON.parse(JSON.stringify(offer));forged.issuer=(await C.api.makeIdentity()).publicKey;
 await assert.rejects(B.api.importPacket(JSON.stringify(forged)),/SIGNATURE_MISMATCH/);
 assert.equal((await B.api.importPacket(JSON.stringify(offer))).kind,'OFFER');
 const interest=await B.api.makeInterest({reason:'I would like to examine this source protocol.',consent:true});
 const altered=JSON.parse(JSON.stringify(interest));altered.link.offerHash='a'.repeat(64);
 await assert.rejects(A.api.importPacket(JSON.stringify(altered)),/SIGNATURE_MISMATCH/);
 await A.api.importPacket(JSON.stringify(interest));
 const decision=await A.api.makeDecision('HOLD');
 assert.equal((await B.api.importPacket(JSON.stringify(decision))).decision,'HOLD');
 const ack=await B.api.makeAck();
 assert.equal((await A.api.importPacket(JSON.stringify(ack))).decision,'HOLD');
 assert.equal(A.api.ledger().localDecision,'HOLD');
});
test('crossing refuses unsafe or identifying descriptions and unknown material claims',async()=>{
 const b=browser();b.get('seed-three').click();const w=b.api.createWorldFamily(b.api.state().projects,'A careful local cooperation model').forks[0];
 const A=cartridgeClient(b.api.portableWorldHtml(w));
 await assert.rejects(A.api.makeOffer({category:'food',label:'Raw perishable fresh fish for pickup',quantity:1,scope:'test',consent:true}),/INVALID_OFFER_FIELDS/);
 await assert.rejects(A.api.makeOffer({category:'tools',label:'Call me at 612-555-1234 for the power drill',quantity:1,scope:'test',consent:true}),/INVALID_OFFER_FIELDS/);
 await assert.rejects(A.api.makeOffer({category:'tools',label:'user@example.com contact person',quantity:1,scope:'test',consent:true}),/INVALID_OFFER_FIELDS/);
 await assert.rejects(A.api.makeOffer({category:'tools',label:'Pickup at 123 Main Street',quantity:1,scope:'test',consent:true}),/INVALID_OFFER_FIELDS/);
 await assert.rejects(A.api.makeOffer({category:'tools',label:'An old screwdriver suitable for an inspected test',quantity:22,scope:'test',consent:true}),/INVALID_OFFER_FIELDS/);
});
test('expired signatures and unknown fields are never interpreted as valid crossing authority',async()=>{
 const b=browser();b.get('seed-three').click();const A=cartridgeClient(b.api.portableWorldHtml(b.api.createWorldFamily(b.api.state().projects,'A time-limited method review').forks[0]));
 const B=cartridgeClient(b.api.portableWorldHtml(b.api.state().worlds.forks[0]));
 const offer=await A.api.makeOffer({category:'art',label:'An original short rehearsal sample',quantity:1,scope:'review',consent:true});
 const unknown={...offer,callbackUrl:'https://unknown.example'};
 await assert.rejects(B.api.importPacket(JSON.stringify(unknown)),/INVALID_OR_EXPIRED_PACKET/);
 const expired={...offer,expiresAt:'2022-01-01T00:00:00Z'};
 await assert.rejects(B.api.importPacket(JSON.stringify(expired)),/INVALID_OR_EXPIRED_PACKET/);
 await assert.rejects(B.api.importPacket('{'),/INVALID_JSON_PACKET/);
 await assert.rejects(B.api.importPacket('x'.repeat(5501)),/PACKET_TOO_LARGE/);
});
test('two unrelated sessions cannot sign or acknowledge another operator’s exact decision',async()=>{
 const b=browser();b.get('seed-three').click();const html=b.api.portableWorldHtml(b.api.createWorldFamily(b.api.state().projects,'A genuine two-holder process').forks[0]);
 const A=cartridgeClient(html),B=cartridgeClient(html),C=cartridgeClient(html);
 const offer=await A.api.makeOffer({category:'digital',label:'One generic printable project checklist',quantity:1,scope:'copy',consent:true});
 await B.api.importPacket(JSON.stringify(offer));
 await C.api.importPacket(JSON.stringify(offer));
 const interestB=await B.api.makeInterest({reason:'I would like to use the checklist as a method.',consent:true});
 const interestC=await C.api.makeInterest({reason:'I would like to examine a different checklist.',consent:true});
 await A.api.importPacket(JSON.stringify(interestB));
 await assert.rejects(A.api.importPacket(JSON.stringify(interestC)),/ONE_INTEREST_PER_OFFER_IN_PILOT/);
 const decision=await A.api.makeDecision('ADMIT');
 await assert.rejects(C.api.importPacket(JSON.stringify(decision)),/DECISION_CHAIN_MISMATCH/);
 await B.api.importPacket(JSON.stringify(decision));
 const ack=await B.api.makeAck();await A.api.importPacket(JSON.stringify(ack));
 await assert.rejects(A.api.importPacket(JSON.stringify(interestC)),/ONE_INTEREST_PER_OFFER_IN_PILOT/);
});
test('portable exports expose no private runtime keys or previous self-reported inventory',()=>{
 const b=browser();b.get('seed-three').click();const ps=b.api.state().projects;
 b.api.recordGlean(ps[0],{key:'writing'},'found','MY PRIVATE SPARE TOOL BOX SECRET');
 const w=b.api.createWorldFamily(ps,'An opt-in world crossing',true).forks[0];
 const html=b.api.portableWorldHtml(w);
 assert.doesNotMatch(html,/MY PRIVATE SPARE TOOL BOX SECRET/);
 assert.doesNotMatch(html,/"found"|"missing"/);
 assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.match(html,/reLATTE · Permissioned crossing/);
 assert.match(html,/No network calls or external assets/);
 assert.ok(!html.includes(ps[0].id));
});
