import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const html=readFileSync(new URL('./Lantern_014_The_Solo_Desk.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

function browser(){
  const nodes=new Map(),disk=new Map(),downloads=[];
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
  const context=createContext({document,window,localStorage,console,Blob,Date,Math,
    URL:{createObjectURL(){return 'blob:offline'},revokeObjectURL(){}},
    navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout(){return 1},clearTimeout(){},confirm(){return true}});
  new Script(scripts[0][1],{filename:'solo-desk.js'}).runInContext(context);
  return {element,window,disk,downloads};
}

test('fully embedded: no remote runtime dependencies or data submission',()=>{
  assert.equal(scripts.length,1);
  assert.match(html,/<style>/);
  assert.doesNotMatch(html,/<script\s+src=/i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(scripts[0][1],/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
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
