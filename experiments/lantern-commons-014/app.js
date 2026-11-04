(function () {
  'use strict';
  const E=window.Lantern014;
  if(!E) throw new Error('Solo engine missing');
  const STORAGE_KEY='lantern014.solo-shelf.v1';
  const $=id=>document.getElementById(id);
  let mode='unstick', minutes=5, current=null, shelf={schema:'lantern.solo-shelf/v1',cards:[]};
  let timerRemaining=0, timerHandle=null, timerRunning=false;
  const create=(tag,attrs={},children=[])=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==='text')node.textContent=String(value);
      else if(key==='class')node.className=value;
      else if(key==='value')node.value=String(value);
      else if(key==='disabled')node.disabled=Boolean(value);
      else node.setAttribute(key,String(value));
    }
    for(const c of children)node.appendChild(typeof c==='string'?document.createTextNode(c):c);
    return node;
  };
  const notify=(message,kind='info')=>{
    const el=$('status'); el.textContent=message;el.dataset.kind=kind;
  };
  const shortId=id=>String(id||'').slice(-9);
  const dateString=iso=>{try {return new Date(iso).toLocaleString();}catch{return 'Saved';}};
  function storageRead(){
    try{
      const raw=window.localStorage.getItem(STORAGE_KEY);
      if(raw)shelf=E.validShelf(JSON.parse(raw));
    }catch(e){notify('Local storage unavailable or a backup is invalid. You can still use and download work cards.','warn');}
  }
  function storageWrite(){
    try{
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify(shelf));
      return true;
    }catch(e){notify('Browser storage is unavailable or full. Download a backup to keep your work.','warn');return false;}
  }
  function newId(){
    if(window.crypto && typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
  }
  function stopTimer(){
    if(timerHandle)clearInterval(timerHandle);
    timerHandle=null;timerRunning=false;$('timerToggle').textContent='▶ Start timebox';
  }
  function displayTimer(){
    const m=Math.floor(timerRemaining/60),s=timerRemaining%60;
    $('timerDisplay').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  function startTimer(){
    if(!current)return;
    if(timerRunning){stopTimer();return;}
    if(timerRemaining<=0)timerRemaining=(current.minutes||5)*60;
    const startedAt=Date.now(),atStart=timerRemaining;
    timerRunning=true;$('timerToggle').textContent='Ⅱ Pause';
    timerHandle=setInterval(()=>{
      timerRemaining=Math.max(0,atStart-Math.floor((Date.now()-startedAt)/1000));
      displayTimer();
      if(timerRemaining<=0){stopTimer();notify('Timebox complete. Record what changed—or keep going if useful.','success');}
    },230);
  }
  function selectedUI(){
    for(const el of document.querySelectorAll('[data-mode]')){
      el.setAttribute('aria-pressed',String(el.dataset.mode===mode));
    }
    for(const el of document.querySelectorAll('[data-minutes]')){
      el.setAttribute('aria-pressed',String(Number(el.dataset.minutes)===minutes));
    }
  }
  function dataFromPage(){
    if(!current)return null;
    return {...current,
      workNote:$('workNote').value,
      outcome:$('outcome').value,
      done:$('doneToggle').getAttribute('aria-pressed')==='true'};
  }
  function cardView(card){
    current=structuredCopy(card);
    stopTimer();timerRemaining=card.minutes*60;displayTimer();
    $('result').hidden=false;
    $('resultTitle').textContent=card.title;
    $('stepText').textContent=card.move;
    $('proofText').textContent=card.proof;
    $('modeLabel').textContent=E.LABELS[card.mode];
    $('timeLabel').textContent=card.minutes+' min';
    $('workNote').value=card.workNote||initialWorkingNote(card);
    $('outcome').value=card.outcome||'';
    $('doneToggle').setAttribute('aria-pressed',String(Boolean(card.done)));
    $('doneToggle').textContent=card.done?'✓ Marked done (undo)':'✓ I did something';
    $('lineage').textContent=card.parent_id?'New copy from snapshot '+shortId(card.parent_id)+', version '+card.version:'Fresh card · not saved';
    const extra=$('modeExtra'); extra.replaceChildren();
    if(card.mode==='sort')renderChecklist(extra);
    else if(card.mode==='decide')renderOptions(extra);
    else if(card.mode==='draft')extra.appendChild(create('p',{class:'help',text:'This is an editable draft, not an AI-written assertion. Replace placeholders and save the result.'}));
    $('result').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function structuredCopy(x){return JSON.parse(JSON.stringify(x));}
  function initialWorkingNote(card){
    if(card.mode==='draft')return `WORKING NOTE — ${card.title}\n\nPurpose / outcome:\n[What should change?]\n\nWhat I know:\n${card.notes.map(n=>'• '+n.text).join('\n')}\n\nUnknown or unverified:\n[Mark uncertain facts here]\n\nNext real action:\n${card.move}\n`;
    if(card.mode==='decide')return `DECISION NOTE\n\nMy choices:\n${card.options.map(x=>'• '+x).join('\n')}\n\nWhat matters to me:\n[write one constraint]\n\nCheapest reversible test:\n[choose an actual 5-minute test]\n`;
    if(card.mode==='sort')return `ITEMS FROM MY NOTE\n${card.notes.map(x=>'• '+x.text).join('\n')}\n\nI will do one item before making another plan.\n`;
    return `FIRST MOVE\n${card.move}\n\nCOUNTS AS DONE\n${card.proof}\n\nWHAT ACTUALLY CHANGED\n`;
  }
  function renderChecklist(target){
    const heading=create('h3',{text:'Tap to mark completed actions'});
    target.appendChild(heading);
    const counts={now:0,next:0,later:0};
    for(const n of current.notes)counts[n.priority]++;
    target.appendChild(create('p',{class:'help',text:`${counts.now} urgent · ${counts.next} upcoming · ${counts.later} later. These tags come from words in your note; you can change what matters.`}));
    for(const n of current.notes){
      const row=create('label',{class:'check-row'}),box=create('input',{type:'checkbox'}),name=create('span',{text:n.text});
      box.checked=Boolean(n.done);
      box.addEventListener('change',()=>{
        n.done=box.checked;
        name.style.textDecoration=box.checked?'line-through':'none';
        notify(`${current.notes.filter(x=>x.done).length} of ${current.notes.length} marked. Only save a snapshot if you want to keep it.`);
      });
      row.append(box,name,create('small',{class:'tag',text:n.priority}));
      target.appendChild(row);
    }
  }
  function renderOptions(target){
    target.replaceChildren();
    target.appendChild(create('h3',{text:'Pick a reversible test—not a permanent verdict'}));
    for(const opt of current.options){
      const btn=create('button',{class:'option-chip',type:'button',text:opt});
      btn.setAttribute('aria-pressed',String(current.chosen===opt));
      btn.addEventListener('click',()=>{
        current.chosen=opt;
        renderOptions(target);
        $('workNote').value += `\n\nSelected for a reversible test: ${opt}\nObserved result: `;
        notify('Choice recorded locally. Do a small test before declaring a winner.');
      });
      target.appendChild(btn);
    }
    target.appendChild(create('p',{class:'help',text:'A choice is not an externally verified outcome. Record what you actually tried.'}));
  }
  function makeCard(){
    try {
      const card=E.build({source:$('source').value,mode,minutes});
      card.workNote=initialWorkingNote(card);
      cardView(card);notify('One next move ready. It works offline; nothing was sent.','success');
    }catch(e){notify(e.message,'error');$('source').focus();}
  }
  function formatFilename(title,ext){
    const slug=String(title||'work-card').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]+/g,'').trim().replace(/\s+/g,'-').slice(0,42)||'work-card';
    return `Lantern-014-${slug}.${ext}`;
  }
  function download(data,name,type){
    const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);
    const a=create('a',{href:url,download:name});document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function downloadCard(){
    const d=dataFromPage();if(!d)return;
    download(E.markdown(d),formatFilename(d.title,'md'),'text/markdown;charset=utf-8');
    notify('Useful note downloaded. Your words are editable in any text editor.','success');
  }
  async function copyCard(){
    const d=dataFromPage();if(!d)return;
    const text=E.markdown(d);
    try {if(navigator.clipboard && navigator.clipboard.writeText){await navigator.clipboard.writeText(text);notify('Note copied to clipboard.','success');return;}}
    catch{}
    const helper=create('textarea');helper.value=text;helper.style.position='fixed';helper.style.left='-9999px';document.body.appendChild(helper);helper.select();
    const ok=document.execCommand('copy');helper.remove();
    notify(ok?'Note copied to clipboard.':'Clipboard unavailable. Use “Download .md” instead.',ok?'success':'warn');
  }
  function saveSnapshot(){
    const card=dataFromPage();if(!card){notify('Make a card first.','warn');return;}
    try {
      const when=new Date().toISOString();
      card.schema='lantern.solo-work-card/v1';card.id=newId();card.createdAt=when;
      const next=E.safeSnapshot(card);
      if(shelf.cards.length>=100){notify('Shelf is full (100 snapshots). Export a backup before clearing older copies.','warn');return;}
      if(shelf.cards.some(x=>x.id===next.id)) throw new Error('Snapshot collision. Retry.');
      shelf.cards.push(next);
      const stored=storageWrite();
      current={...structuredCopy(next),parent_id:next.id,version:next.version+1,id:''};
      $('lineage').textContent='Saved snapshot '+shortId(next.id)+' · next edit forks from that snapshot.';
      renderShelf();
      notify(stored?'Snapshot saved in this browser. Parent will not be overwritten.':'Snapshot is in this tab but browser storage failed. Export your Shelf.',stored?'success':'warn');
    }catch(e){notify('Snapshot could not be saved: '+e.message,'error');}
  }
  function renderShelf(){
    const target=$('shelfItems'); target.replaceChildren();
    $('shelfCount').textContent=shelf.cards.length+' snapshots';
    if(!shelf.cards.length){target.appendChild(create('p',{class:'help',text:'No saved cards. Make something useful, then tap “Save snapshot”.'}));return;}
    for(const card of shelf.cards.slice().reverse().slice(0,20)){
      const row=create('article',{class:'shelf-row'});
      const meta=create('div',{class:'shelf-meta'},[
        create('strong',{text:card.title}),
        create('small',{text:`${card.mode} · v${card.version} · ${dateString(card.createdAt)} · ${card.done?'self-reported done':'open'}`}),
        create('small',{text:card.parent_id?`From ${shortId(card.parent_id)} · ${shortId(card.id)}`:shortId(card.id)})
      ]);
      const actions=create('div',{class:'shelf-actions'});
      const fork=create('button',{class:'small-button',type:'button',text:'Fork / continue'});
      fork.addEventListener('click',()=>{
        const c=E.safeSnapshot(card);c.parent_id=card.id;c.version=card.version+1;c.id='';c.createdAt='';c.done=false;c.outcome='';
        $('source').value=c.source;mode=c.mode;minutes=c.minutes;selectedUI();cardView(c);
        notify('Working on a copy. The saved parent remains unchanged.');
      });
      const exportOne=create('button',{class:'small-button subtle',type:'button',text:'Export'});
      exportOne.addEventListener('click',()=>download(E.markdown(card),formatFilename(card.title,'md'),'text/markdown;charset=utf-8'));
      actions.append(fork,exportOne);row.append(meta,actions);target.appendChild(row);
    }
    if(shelf.cards.length>20)target.appendChild(create('p',{class:'help',text:'Showing the newest 20. Export the Shelf to keep all snapshots.'}));
  }
  function backupShelf(){
    const json=JSON.stringify({...shelf,exported_at:new Date().toISOString(),note:'Local self-reported work cards only. No external verification.'},null,2);
    download(json,'Lantern-014-Solo-Shelf.json','application/json;charset=utf-8');
    notify('Shelf backup downloaded. Keep it somewhere you control.','success');
  }
  async function importShelf(file){
    if(!file)return;
    if(file.size>1200000){notify('That backup is over the 1.2 MB import limit.','error');return;}
    try {
      const raw=JSON.parse(await file.text());const incoming=E.validShelf(raw);
      if(!confirm(`Import ${incoming.cards.length} snapshots? Identical IDs will be skipped; existing cards stay.`))return;
      const ids=new Set(shelf.cards.map(c=>c.id));let added=0;
      for(const c of incoming.cards){
        if(ids.has(c.id))continue;
        if(shelf.cards.length>=100)break;
        shelf.cards.push(c);ids.add(c.id);added++;
      }
      const stored=storageWrite();renderShelf();
      notify(`${added} snapshots imported. ${stored?'Saved in this browser.':'Download backup; browser storage failed.'}` ,stored?'success':'warn');
    }catch(e){notify('Import refused: '+e.message,'error');}
  }
  function clearShelf(){
    if(!shelf.cards.length)return;
    if(!confirm('Delete all Solo Shelf snapshots stored in this browser? Export first if you need them.'))return;
    shelf={schema:'lantern.solo-shelf/v1',cards:[]};storageWrite();renderShelf();notify('Local shelf cleared. Downloaded files were not changed.');
  }
  document.addEventListener('DOMContentLoaded',()=>{
    storageRead();selectedUI();renderShelf();
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;selectedUI();}));
    document.querySelectorAll('[data-minutes]').forEach(b=>b.addEventListener('click',()=>{minutes=Number(b.dataset.minutes);selectedUI();}));
    $('makeCard').addEventListener('click',makeCard);
    $('sample').addEventListener('click',()=>{
      $('source').value='I have 40 photos scattered in Downloads. I need to pick three worth keeping. I can work on this for five minutes.';
      mode='unstick';minutes=5;selectedUI();$('source').focus();notify('Example loaded. Tap “Make my next move” to see the result.');
    });
    $('clearInput').addEventListener('click',()=>{$('source').value='';$('source').focus();notify('Input cleared. Saved snapshots were not changed.');});
    $('downloadCard').addEventListener('click',downloadCard);
    $('copyCard').addEventListener('click',copyCard);
    $('saveSnapshot').addEventListener('click',saveSnapshot);
    $('timerToggle').addEventListener('click',startTimer);
    $('timerReset').addEventListener('click',()=>{stopTimer();timerRemaining=(current?.minutes||minutes)*60;displayTimer();});
    $('doneToggle').addEventListener('click',()=>{
      const done=$('doneToggle').getAttribute('aria-pressed')!=='true';
      $('doneToggle').setAttribute('aria-pressed',String(done));$('doneToggle').textContent=done?'✓ Marked done (undo)':'✓ I did something';
      notify(done?'Completion marked as your own report. Write what actually changed and save a snapshot.':'Completion mark undone.');
    });
    $('exportShelf').addEventListener('click',backupShelf);
    $('importShelf').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',async e=>{await importShelf(e.target.files[0]);e.target.value='';});
    $('clearShelf').addEventListener('click',clearShelf);
    $('source').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();makeCard();}});
    notify('Offline and ready. Your words stay in this browser unless you export them.');
  });
})();
