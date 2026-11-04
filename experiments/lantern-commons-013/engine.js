/* LANTERN COMMONS 013 — offline, deterministic SOCIAL MODEL.
   Does NOT modify Minecraft worlds or grant external authority.
   All simulations are fictional and agent policies are authored. */
(function(root){
'use strict';
const SCHEMA='lantern.living-commons-browser-world/v1';
const CARTRIDGE='lantern.browser-world-cartridge/v1';
const ENGINE='013.1';
const ROLES=['grower','builder','steward','explorer'];
const NAMES=['Ada','Rook','Fern','Moss','Pip','Orin','Wren','Briar','Cedar','Lark','Nova','Vale'];
const MAX_PEOPLE=12, MAX_HISTORY=180, MAX_CARTRIDGES=64;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const copy=x=>JSON.parse(JSON.stringify(x));
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
// UTF8 SHA-256, synchronous and usable when browser file:// WebCrypto is unavailable.
function sha256(value){
 const bytes=new TextEncoder().encode(value),bitLength=bytes.length*8;
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const len=Math.ceil((bytes.length+9)/64)*64,buf=new Uint8Array(len);buf.set(bytes);buf[bytes.length]=128;
 const dv=new DataView(buf.buffer);const hi=Math.floor(bitLength/0x100000000),lo=bitLength>>>0;dv.setUint32(len-8,hi);dv.setUint32(len-4,lo);
 const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const rot=(x,n)=>x>>>n|x<<(32-n),w=new Uint32Array(64);
 for(let i=0;i<len;i+=64){
  for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4);
  for(let t=16;t<64;t++){let s0=rot(w[t-15],7)^rot(w[t-15],18)^(w[t-15]>>>3),s1=rot(w[t-2],17)^rot(w[t-2],19)^(w[t-2]>>>10);w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;}
  let [a,b,c,d,e,f,g,h]=H;
  for(let t=0;t<64;t++){let s1=rot(e,6)^rot(e,11)^rot(e,25),ch=(e&f)^(~e&g),t1=(h+s1+ch+k[t]+w[t])>>>0,s0=rot(a,2)^rot(a,13)^rot(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  const vals=[a,b,c,d,e,f,g,h];for(let t=0;t<8;t++)H[t]=(H[t]+vals[t])>>>0;
 }
 return H.map(x=>x.toString(16).padStart(8,'0')).join('');
}
function log(s,type,text,who='commons'){
 s.history.push({day:s.day,type,who,text:String(text).slice(0,300)});
 if(s.history.length>MAX_HISTORY)s.history.splice(0,s.history.length-MAX_HISTORY);
}
function makePerson(id,role,name,grain,seed,wood){
 const reserves={grower:1,builder:1,steward:2,explorer:0};
 return {id,name,role,grain,seed,wood,hunger:3,vigor:8,reserve:reserves[role],status:'present',decisions:0};
}
function newWorld(){
 const s={schema:SCHEMA,engine:ENGINE,day:1,year:1,weather:'clear',weatherDays:0,
  water:8,forest:9,irrigation:false,ideaKnown:false,
  stores:{grain:3,seeds:2,wood:0},
  people:[makePerson('p1','grower','Ada',2,3,0),makePerson('p2','builder','Rook',2,1,2),makePerson('p3','steward','Fern',3,1,0)],
  field:Array.from({length:12},(_,i)=>({stage:i<3?2:0,owner:i<3?'p1':null})),
  history:[],stats:{harvested:0,eaten:0,shared:0,treesUsed:0,irrigationBuilt:0,lostPlots:0,shortages:0,visitors:0,departed:0},
  nextPersonId:4,randomState:291834,cycle:0};
 log(s,'foundation','Three neighbors begin with finite stores, three growing plots, and the right to refuse.');
 return s;
}
function check(s){
 if(!s||s.schema!==SCHEMA||s.engine!==ENGINE)throw Error('Unknown or incompatible browser world version');
 for(const f of ['day','year','water','forest','nextPersonId','randomState'])if(!Number.isSafeInteger(s[f])||s[f]<0)throw Error('Invalid world '+f);
 if(s.day>200000||s.people.length>MAX_PEOPLE||s.field.length!==12||s.history.length>MAX_HISTORY)throw Error('World limits exceeded');
 for(const n of ['grain','seeds','wood'])if(!Number.isSafeInteger(s.stores[n])||s.stores[n]<0||s.stores[n]>100000)throw Error('Invalid public '+n);
 if(!['clear','drought','rain','frost'].includes(s.weather)||!Number.isInteger(s.weatherDays)||s.weatherDays<0)throw Error('Invalid weather');
 if(s.water>30||s.forest>30)throw Error('Impossible environmental reserves');
 const ids=new Set();
 for(const p of s.people){
  if(!p||typeof p.id!=='string'||ids.has(p.id)||!ROLES.includes(p.role)||!['present','departed'].includes(p.status))throw Error('Invalid inhabitant');
  ids.add(p.id);
  if(typeof p.name!=='string'||p.name.length>40)throw Error('Invalid inhabitant name');
  for(const n of ['grain','seed','wood','hunger','vigor','reserve','decisions'])if(!Number.isSafeInteger(p[n])||p[n]<0||p[n]>100000)throw Error('Invalid inhabitant stock '+n);
  if(p.hunger>10||p.vigor>10)throw Error('Invalid wellbeing');
 }
 for(const plot of s.field)if(!plot||!Number.isInteger(plot.stage)||plot.stage<0||plot.stage>3||!(plot.owner===null||ids.has(plot.owner)))throw Error('Invalid plot');
 if(!s.stats||typeof s.stats!=='object'||!Array.isArray(s.history))throw Error('Invalid history');
 return true;
}
function rng(s){s.randomState=(1664525*s.randomState+1013904223)>>>0;return s.randomState/4294967296;}
function active(s){return s.people.filter(p=>p.status==='present');}
function total(s,kind){return active(s).reduce((sum,p)=>sum+p[kind]||sum,0);}
function newLife(s){
 if(active(s).length>=MAX_PEOPLE){log(s,'limit','The village cannot support more than twelve model inhabitants.');return false;}
 const id='p'+s.nextPersonId++,role=ROLES[(s.nextPersonId+1)%ROLES.length];
 const name=NAMES[(s.nextPersonId-2)%NAMES.length]+' '+String(s.nextPersonId-1);
 const p=makePerson(id,role,name,0,0,0);p.hunger=5;p.vigor=7;
 s.people.push(p);s.stats.visitors++;log(s,'arrival',name+' arrives without supplies and must seek consent-based help. '+name+' brings no conjured grain.',id);
 check(s);return p;
}
function disturb(s,event){
 const events={
  drought:()=>{s.weather='drought';s.weatherDays=4;s.water=Math.max(0,s.water-3);log(s,'shock','Four days of drought. Water falls by three immediately; crops may stall.');},
  rain:()=>{s.weather='rain';s.weatherDays=3;s.water=clamp(s.water+5,0,30);log(s,'weather','Three rainy days begin; the basin gains five water.');},
  frost:()=>{s.weather='frost';s.weatherDays=2;let lost=0;for(const f of s.field){if(f.stage>0&&rng(s)<0.7){f.stage=0;f.owner=null;lost++;}}s.stats.lostPlots+=lost;log(s,'shock','A frost ruins '+lost+' planted plots. Nothing is silently replaced.');},
  visitor:()=>newLife(s),
  discovery:()=>{s.ideaKnown=true;log(s,'discovery','An irrigation design is discovered. It still needs three voluntarily contributed wood.');}
 };
 if(!Object.hasOwn(events,event))throw Error('Unknown event');
 events[event]();check(s);return s;
}
function nourish(s,p){
 if(p.hunger<6)return;
 if(p.grain>0){p.grain--;p.hunger=clamp(p.hunger-4,0,10);s.stats.eaten++;log(s,'meal',p.name+' eats one grain from personal stores.',p.id);return;}
 if(s.stores.grain>0){s.stores.grain--;p.hunger=clamp(p.hunger-4,0,10);s.stats.eaten++;log(s,'meal',p.name+' accepts one grain from the voluntary common store.',p.id);return;}
 s.stats.shortages++;log(s,'need',p.name+' needs food, but no accessible grain remains.',p.id);
}
function decide(s,p){
 if(p.status!=='present')return;
 p.decisions++;
 if(p.hunger>=6)nourish(s,p);
 // A personal reserve is an individual commitment, never a community debt.
 const someoneHungry=active(s).some(q=>q.id!==p.id&&q.hunger>=5&&q.grain===0);
 if(someoneHungry&&p.grain>p.reserve+1){p.grain--;s.stores.grain++;s.stats.shared++;log(s,'gift',p.name+' voluntarily contributes one grain above their protected reserve.',p.id);}
 else if(someoneHungry&&p.grain<=p.reserve&&p.grain>0)log(s,'refusal',p.name+' preserves '+p.grain+' grain for personal needs. No penalty.',p.id);
 if(p.role==='grower'){
  const ripe=s.field.find(f=>f.stage===3&&f.owner===p.id);
  if(ripe){ripe.stage=0;ripe.owner=null;p.grain+=2;p.seed++;s.stats.harvested+=2;log(s,'harvest',p.name+' harvests one ripe model plot: +2 grain and +1 seed.',p.id);}
  else if(p.seed>0&&s.water>1){const plot=s.field.find(f=>f.stage===0);if(plot){plot.stage=1;plot.owner=p.id;p.seed--;log(s,'plant',p.name+' plants one seed. Water and time are required.',p.id);}}
  if(p.grain>p.reserve+2&&s.stores.seeds===0&&p.seed>1){p.seed--;s.stores.seeds++;log(s,'gift',p.name+' offers one seed for future communal planting.',p.id);}
 }
 if(p.role==='builder'){
  if(!s.irrigation&&p.wood>0&&s.ideaKnown){p.wood--;s.stores.wood++;log(s,'gift',p.name+' contributes one wood to an irrigation proposal.',p.id);}
  if(p.wood<2&&s.forest>0){s.forest--;p.wood++;s.stats.treesUsed++;log(s,'work',p.name+' gathers one wood from the finite forest.',p.id);}
 }
 if(p.role==='steward'&&s.water<3&&!s.ideaKnown)log(s,'idea',p.name+' proposes irrigation, but needs a workable design and voluntary material.',p.id);
 if(p.role==='explorer'&&s.water<3&&s.forest>0&&rng(s)<.25){s.ideaKnown=true;log(s,'idea',p.name+' sketches an irrigation design. It still needs community resources.',p.id);}
}
function oneDay(s){
 s.day++;if(s.day%15===1)s.year++;
 if(s.weather==='rain')s.water=clamp(s.water+3,0,30);
 else if(s.weather==='drought')s.water=Math.max(0,s.water-2);
 else if(s.day%3===0)s.water=clamp(s.water+1,0,30);
 if(s.weatherDays>0){s.weatherDays--;if(s.weatherDays===0)s.weather='clear';}
 if(s.irrigation&&s.water>0&&s.day%2===0)s.water=Math.max(0,s.water-1);
 const growing=s.field.filter(x=>x.stage>0&&x.stage<3);
 if(growing.length>0&&s.water>0){s.water--;for(const f of growing)f.stage=Math.min(3,f.stage+(s.weather==='frost'?0:1));}
 if(s.day%6===0&&s.forest<12)s.forest++;
 for(const p of active(s)){
  p.hunger=clamp(p.hunger+1,0,10);
  decide(s,p);
  if(p.hunger>=9){p.vigor=clamp(p.vigor-1,0,10);if(p.vigor===0){p.status='departed';s.stats.departed++;log(s,'departure',p.name+' departs seeking food elsewhere; no claim about real lives.',p.id);}}
  else if(p.hunger<4)p.vigor=clamp(p.vigor+1,0,10);
 }
 if(!s.irrigation&&s.ideaKnown&&s.stores.wood>=3){s.stores.wood-=3;s.irrigation=true;s.stats.irrigationBuilt++;log(s,'project','Three voluntarily pooled wood become the irrigation system.');}
 if(s.irrigation&&s.day%3===0&&s.water<30){s.water=clamp(s.water+2,0,30);log(s,'project','Irrigation channels two modeled water into the field.');}
 if(s.day%5===0)log(s,'day','Day '+s.day+': stores '+s.stores.grain+' common grain; '+active(s).length+' residents; water '+s.water+'.');
 check(s);
}
function advance(s,n){if(!Number.isInteger(n)||n<1||n>14)throw Error('Advance 1–14 days');for(let i=0;i<n;i++)oneDay(s);return s;}
function speak(s,id,input){
 const p=s.people.find(x=>x.id===id);if(!p)throw Error('Unknown inhabitant');
 const q=String(input||'').toLowerCase().slice(0,250);
 if(/hungr|food|bread|eat|grain/.test(q))return p.name+': "I have '+p.grain+' grain and my hunger is '+p.hunger+'/10. The common store holds '+s.stores.grain+'. A gift is not a debt."';
 if(/why|refus|share|help|give|trust|cooperat/.test(q))return p.name+': "I protect at least '+p.reserve+' personal grain. If I have more than I need and another neighbor lacks food, I may offer some. Refusal remains allowed."';
 if(/water|drought|weather|storm/.test(q))return p.name+': "There are '+s.water+' water units. The sky is '+s.weather+'. We cannot negotiate with a dry field, but we can plan together."';
 if(/build|irrig|wood|project/.test(q))return p.name+': "Irrigation needs a design and three voluntarily pooled wood. Right now the common wood store has '+s.stores.wood+'."';
 if(/seed|plant|crop|harvest|farm/.test(q))return p.name+': "Seeds cost resources today, but can become grain after enough growing days and water. Our fields have '+s.field.filter(f=>f.stage===3).length+' ripe plots."';
 if(/future|tomorrow|generation|family/.test(q))return p.name+': "The next version inherits what we leave behind: fields, stores, infrastructure, and shortages. Preserve the original before you experiment."';
 return p.name+': "I am a scripted '+p.role+' in this experiment, not a language-model mind. Ask me about food, water, sharing, building, or tomorrow."';
}
function cartridge(s,parentId,branch,version){
 check(s);
 if(parentId!==null&&(!/^[a-f0-9]{64}$/.test(parentId)))throw Error('Invalid parent cartridge ID');
 const world=copy(s),worldHash=sha256(stable(world));
 const body={schema:CARTRIDGE,engine:ENGINE,medium:'OFFLINE_BROWSER_MODEL_NOT_MINECRAFT_SAVE',
  branch:String(branch||'experiment').slice(0,50),version:String(version),parentCartridgeId:parentId,
  worldSha256:worldHash,world};
 return {...body,cartridgeId:sha256(stable(body))};
}
function verifyCartridge(c){
 if(!c||c.schema!==CARTRIDGE||c.engine!==ENGINE||c.medium!=='OFFLINE_BROWSER_MODEL_NOT_MINECRAFT_SAVE')throw Error('Unrecognized browser model cartridge');
 if(typeof c.branch!=='string'||c.branch.length>50||!/^0\.1\.\d+$/.test(c.version)||!
  (c.parentCartridgeId===null||/^[a-f0-9]{64}$/.test(c.parentCartridgeId)))throw Error('Invalid cartridge lineage fields');
 check(c.world);
 if(sha256(stable(c.world))!==c.worldSha256)throw Error('Cartridge world content was modified');
 const body={schema:c.schema,engine:c.engine,medium:c.medium,branch:c.branch,version:c.version,
  parentCartridgeId:c.parentCartridgeId,worldSha256:c.worldSha256,world:c.world};
 if(sha256(stable(body))!==c.cartridgeId)throw Error('Cartridge identity does not match its contents');
 return true;
}
function family(){const w=newWorld(),genesis=cartridge(w,null,'foundation','0.1.0');return {schema:'lantern.living-commons-shelf/v1',cartridges:[genesis],baseId:genesis.cartridgeId,working:copy(w),lastLabel:'Foundation'};}
function checkShelf(s){
 if(!s||s.schema!=='lantern.living-commons-shelf/v1'||!Array.isArray(s.cartridges)||s.cartridges.length<1||s.cartridges.length>MAX_CARTRIDGES)throw Error('Shelf format invalid');
 if(new Set(s.cartridges.map(x=>x.cartridgeId)).size!==s.cartridges.length)throw Error('Duplicated cartridge IDs');
 for(const c of s.cartridges)verifyCartridge(c);
 check(s.working);if(!s.cartridges.some(c=>c.cartridgeId===s.baseId))throw Error('Unknown working copy origin');
 return true;
}
function snapshot(s,branch){
 checkShelf(s);if(s.cartridges.length>=MAX_CARTRIDGES)throw Error('Shelf full: export your worlds to preserve more.');
 const current=s.cartridges.find(c=>c.cartridgeId===s.baseId);
 const v='0.1.'+(Math.max(...s.cartridges.map(c=>Number(c.version.split('.')[2])))+1);
 const c=cartridge(s.working,s.baseId,branch||'fork-'+v.replaceAll('.','-'),v);
 verifyCartridge(c);
 if(s.cartridges.some(x=>x.cartridgeId===c.cartridgeId))throw Error('This exact cartridge already exists');
 s.cartridges.push(c);s.baseId=c.cartridgeId;s.working=copy(c.world);s.lastLabel=c.branch;
 return c;
}
function checkout(s,id){checkShelf(s);const c=s.cartridges.find(x=>x.cartridgeId===id);if(!c)throw Error('Unknown saved reality');s.working=copy(c.world);s.baseId=id;s.lastLabel=c.branch;return c;}
function compare(a,b){return {days:a.day-b.day,water:a.water-b.water,people:active(a).length-active(b).length,
  grain:a.stores.grain+total(a,'grain')-(b.stores.grain+total(b,'grain')),
  planted:a.field.filter(f=>f.stage>0).length-b.field.filter(f=>f.stage>0).length,
  irrigation:Number(a.irrigation)-Number(b.irrigation),departures:a.stats.departed-b.stats.departed,
  harvest:a.stats.harvested-b.stats.harvested};}
const Engine={SCHEMA,CARTRIDGE,ENGINE,sha256,stable,copy,newWorld,makePerson,check,active,total,newLife,disturb,advance,speak,cartridge,verifyCartridge,family,checkShelf,snapshot,checkout,compare};
if(typeof module!=='undefined'&&module.exports)module.exports=Engine;
root.Lantern013Engine=Engine;
})(typeof globalThis==='object'?globalThis:this);
