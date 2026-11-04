/* 013 offline user interface. No external network calls, no eval, no innerHTML from users. */
(function(){
'use strict';
const E=globalThis.Lantern013Engine,$=id=>document.getElementById(id),KEY='lantern013_living_commons_shelf_v1';
let shelf,persistent=true,selected=null,compareId=null,chat=[],toastTimer;
const el=(tag,klass,content)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(content!==undefined)n.textContent=String(content);return n;};
const append=(parent,...children)=>{for(const c of children)parent.append(c);return parent;};
const short=id=>id?String(id).slice(0,11)+'…':'none';
function notice(msg,error=false){const b=$('banner');b.textContent=msg;b.className='banner visible';b.style.background=error?'#dfb5a2':'#e1cf96';clearTimeout(toastTimer);toastTimer=setTimeout(()=>b.className='banner',6500);}
function persist(){
 try{E.checkShelf(shelf);localStorage.setItem(KEY,JSON.stringify(shelf));}
 catch(err){persistent=false;notice('Device storage unavailable. Export your World Shelf before closing; '+err.message,true);}
}
function load(){try{const t=localStorage.getItem(KEY);if(t){const x=JSON.parse(t);E.checkShelf(x);return x;}}catch(err){persistent=false;notice('Started a new local world. Existing storage could not be read: '+err.message,true);}return E.family();}
function change(fn){try{const answer=fn();E.check(shelf.working);persist();render();return answer;}catch(err){notice('Action stopped: '+err.message,true);render();return null;}}
function render(){const s=shelf.working;
 $('day').textContent=s.day;$('year').textContent=s.year;$('peopleN').textContent=E.active(s).length;
 $('water').textContent=s.water;$('grain').textContent=s.stores.grain;$('fields').textContent=s.field.filter(x=>x.stage>0).length;
 $('projects').textContent=s.irrigation?'Built':'Not yet';
 $('worldStatus').textContent=`${s.weather.toUpperCase()} · year ${s.year} · working copy of ${short(shelf.baseId)}`;
 $('weather').textContent='Sky: '+s.weather+(s.weatherDays?' ('+s.weatherDays+' days)':'');
 $('forest').textContent='Forest wood: '+s.forest;
 $('stocks').textContent='Private grain: '+E.total(s,'grain');
 $('season').textContent='Saved worlds: '+shelf.cartridges.length;
 const field=$('fieldGrid');field.replaceChildren();
 s.field.forEach((plot,i)=>{
  const type=['','seed','shoot','ripe'][plot.stage];
  const txt=['·','◔','♣','✺'][plot.stage];
  const button=el('button','tile '+type,txt);
  button.type='button';button.title=`Plot ${i+1}: ${['empty','newly planted','growing','ripe'][plot.stage]}`;
  button.setAttribute('aria-label',button.title);
  button.onclick=()=>notice(button.title+(plot.owner?' · tended by '+(s.people.find(x=>x.id===plot.owner)?.name||'unknown'):' · unclaimed'));
  field.append(button);
 });
 renderPeople();renderJournal();renderShelf();renderCompare();
}
function renderPeople(){const people=$('people'),list=shelf.working.people;
 if(!selected||!list.some(p=>p.id===selected))selected=list[0]?.id;
 people.replaceChildren();
 for(const p of list){
  const btn=el('button','person'+(selected===p.id?' selected':'')+(p.status!=='present'?' departed':''));
  btn.type='button';btn.setAttribute('aria-pressed',selected===p.id?'true':'false');
  append(btn,el('span','avatar',p.name.charAt(0)),el('strong','',p.name),
   el('span','',p.role+' · '+p.status),el('span','',`grain ${p.grain} · reserve ${p.reserve}`),el('span','',`hunger ${p.hunger}/10 · vigor ${p.vigor}/10`));
  btn.onclick=()=>{selected=p.id;chat=[];renderPeople();renderChat();};people.append(btn);
 }
 renderChat();
}
function renderChat(){const s=shelf.working,p=s.people.find(x=>x.id===selected),box=$('chatThread');
 $('speakerLabel').textContent=p?p.name+' / '+p.role.toUpperCase():'NO NEIGHBORS';
 box.replaceChildren();
 if(chat.length===0&&p)append(box,el('div','bubble',`${p.name}: "Ask about food, water, cooperation, or tomorrow. I can refuse and I can change my mind."`));
 for(const line of chat)append(box,el('div','bubble'+(line.isUser?' user':''),line.text));
 box.scrollTop=box.scrollHeight;
}
function ask(question){const q=String(question||'').trim().slice(0,250);if(!q)return;const p=shelf.working.people.find(x=>x.id===selected);if(!p)return;
 chat.push({isUser:true,text:q},{isUser:false,text:E.speak(shelf.working,p.id,q)});
 if(chat.length>20)chat=chat.slice(-20);
 renderChat();$('chatInput').value='';
}
function renderJournal(){const box=$('journal');box.replaceChildren();
 const list=shelf.working.history.slice(-11).reverse();
 for(const entry of list){const row=el('div','eventline');append(row,el('b','',`D${entry.day}`),el('span','',entry.text));box.append(row);}
 if(!list.length)box.append(el('p','subtle','No events recorded.'));
}
function renderShelf(){const area=$('shelf');area.replaceChildren();
 for(const c of shelf.cartridges.slice().reverse()){
  const active=shelf.baseId===c.cartridgeId;
  const card=el('article','cartridge'+(active?' active':''));
  append(card,el('div','eyebrow',c.version+(active?' / WORKING SOURCE':'')),
   el('h3','',c.branch),el('p','',`Day ${c.world.day} · ${E.active(c.world).length} residents · water ${c.world.water}`),
   el('div','hash',short(c.cartridgeId)),
   el('p','',`Parent: ${short(c.parentCartridgeId)}`));
  const buttons=el('div','actions');
  const explore=el('button','','Explore copy');explore.type='button';explore.onclick=()=>{
   if(!confirm('Checkout this sealed world as a new working copy? Unsaved changes to your current working copy will be discarded.'))return;
   change(()=>{E.checkout(shelf,c.cartridgeId);chat=[];compareId=null;selected=null;notice('Checked out a COPY of '+c.branch+'. Original stays sealed.');});
  };
  const compare=el('button','','Compare');compare.type='button';compare.onclick=()=>{compareId=c.cartridgeId;renderCompare();$('comparePanel').scrollIntoView({behavior:'smooth',block:'nearest'});};
  const exportOne=el('button','','Export');exportOne.type='button';exportOne.onclick=()=>download('Lantern013_'+c.branch+'_'+c.version+'.json',JSON.stringify(c,null,2));
  append(buttons,explore,compare,exportOne);card.append(buttons);area.append(card);
 }
}
function renderCompare(){const s=shelf.working,c=shelf.cartridges.find(x=>x.cartridgeId===compareId)||shelf.cartridges.find(x=>x.cartridgeId===shelf.baseId),box=$('comparePanel');
 if(!c)return;
 const diff=E.compare(s,c.world),entries=[['Days',diff.days],['Water',diff.water],['Residents',diff.people],['Total grain',diff.grain],['Planted plots',diff.planted],['Irrigation',diff.irrigation],['Harvest produced',diff.harvest],['Departures',diff.departures]];
 box.replaceChildren(el('strong','',`Working world vs. ${c.branch} (${c.version})`));
 box.append(el('p','',entries.map(([name,x])=>name+': '+(x>0?'+':'')+x).join('   ·   ')));
 box.append(el('small','subtle','These differences describe the browser model only, not the official Minecraft save worlds.'));
}
function download(filename,content){const blob=new Blob([content],{type:'application/json;charset=utf-8'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),15000);notice('Exported '+filename+'. Keep this copy if device storage is unavailable.');}
function seal(label){return change(()=>{const c=E.snapshot(shelf,label||'day-'+shelf.working.day+'-branch-'+shelf.cartridges.length);notice('Reality sealed: '+c.version+' · '+short(c.cartridgeId)+' · parent preserved');return c;});}
function bind(){
 $('createLife').onclick=()=>change(()=>{const p=E.newLife(shelf.working);if(p){selected=p.id;chat=[];notice(p.name+' arrived. No supplies were generated.');}});
 $('disturb').onclick=()=>{$('eventPanel').classList.toggle('hidden');$('disturb').classList.toggle('active');};
 $('cancelDisturb').onclick=()=>{$('eventPanel').classList.add('hidden');$('disturb').classList.remove('active');};
 document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>change(()=>{E.disturb(shelf.working,b.dataset.event);$('eventPanel').classList.add('hidden');$('disturb').classList.remove('active');notice('Event witnessed: '+b.textContent.trim());}));
 const advance=n=>change(()=>{E.advance(shelf.working,n);notice(n+' day'+(n>1?'s':'')+' passed. Resources and needs persist.');});
 $('simulate').onclick=()=>advance(1);$('oneDay').onclick=()=>advance(1);$('sevenDays').onclick=()=>advance(7);
 $('fork').onclick=()=>seal('fork-day-'+shelf.working.day+'-'+shelf.cartridges.length);
 $('saveReality').onclick=()=>seal('witness-day-'+shelf.working.day+'-'+shelf.cartridges.length);
 $('chatForm').onsubmit=e=>{e.preventDefault();ask($('chatInput').value);};
 document.querySelectorAll('.prompt').forEach(b=>b.onclick=()=>ask(b.dataset.q));
 $('exportAll').onclick=()=>download('Lantern013_World_Shelf.json',JSON.stringify({schema:'lantern.living-commons-export/v1',exportedAt:new Date().toISOString(),shelf},null,2));
 $('importBtn').onclick=()=>$('importFile').click();
 $('importFile').onchange=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>3000000){notice('File is too large for this offline cartridge importer.',true);return;}
  try{
   const data=JSON.parse(await file.text());
   const entries=data.schema==='lantern.living-commons-export/v1'&&data.shelf?data.shelf.cartridges:[data];
   if(!Array.isArray(entries)||entries.length>64)throw Error('Invalid imported cartridge list');
   for(const c of entries)E.verifyCartridge(c);
   const originals=new Set(shelf.cartridges.map(x=>x.cartridgeId)),add=entries.filter(c=>!originals.has(c.cartridgeId));
   if(shelf.cartridges.length+add.length>64)throw Error('World Shelf is full; export before importing more.');
   if(add.length===0){notice('All imported world cartridges are already on this device.');return;}
   if(!confirm(`Import ${add.length} verified browser model cartridge(s)? Your current working copy will not be altered.`))return;
   shelf.cartridges.push(...add.map(E.copy));persist();render();notice('Imported '+add.length+' hash-verified browser cartridges.');
  }catch(err){notice('Import rejected: '+err.message,true);}
 };
 $('reset').onclick=()=>{
  if(!confirm('Delete this device\'s current local World Shelf? Export it first if you want to preserve its history.'))return;
  if(!confirm('Final confirmation: create a fresh village and discard the local copy of prior worlds?'))return;
  shelf=E.family();selected=null;compareId=null;chat=[];persist();render();notice('New founding browser village created. Prior exports are unaffected.');
 };
}
shelf=load();selected=shelf.working.people[0]?.id;bind();render();
if(!persistent)notice('Local browser storage may be unavailable. Export your World Shelf before closing.',true);
})();
