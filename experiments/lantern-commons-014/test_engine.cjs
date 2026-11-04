'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
// reLATTE's root package declares "type": "module". Evaluate the exact
// browser UMD source in an isolated CommonJS VM, rather than importing .js
// as an ESM with no named exports.
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const sandbox={module:{exports:{}},console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8'),sandbox);
const e=sandbox.module.exports;
const make=(source,mode='unstick',minutes=5)=>e.build({source,mode,minutes});
test('photo example creates one physical file action instead of requesting another invitation',()=>{
 const c=make('I need to pick three photos from Downloads.');
 assert.match(c.move,/folder.*Photo picks/);
 assert.match(c.proof,/Three actual image files/);
 assert.equal(c.done,false);
});
test('file sorting creates an independent, executable movement',()=>{
 const c=make('My Downloads folder is full of loose files');
 assert.match(c.move,/move five loose files/);
});
test('debugging captures a real observed failure instead of declaring a fix',()=>{
 const c=make('There is a bug in the app');
 assert.match(c.move,/Reproduce/); assert.match(c.proof,/observed failure/);
});
test('user notes split into checked items and rough urgency priorities',()=>{
 const c=make('Today: clean desk\nLater: archive photos\nSort cables','sort');
 assert.equal(c.notes.length,3);assert.equal(c.notes[0].priority,'now');
 assert.equal(c.notes[1].priority,'later'); assert.equal(c.notes.every(x=>!x.done),true);
});
test('draft keeps original details without claiming fact checking',()=>{
 const c=make('Build the song list\nCheck cable','draft');
 assert.match(e.markdown(c),/Check cable/);
 assert.equal(c.done,false);
});
test('decision mode extracts options without choosing on behalf of user',()=>{
 const c=make('I need to choose between walking or taking the bus','decide');
 assert.equal(c.options.length,2);assert.equal(c.chosen,null);
});
test('source is capped and modes and time budgets are explicit',()=>{
 assert.throws(()=>make('', 'unstick'),/Write one sentence/);
 assert.throws(()=>make('x'.repeat(9000),'unstick'),/under 8,000/);
 assert.throws(()=>make('a','unknown'),/Unknown mode/);
 assert.throws(()=>make('a','unstick',100),/time budget/);
});
test('no completion receipt is invented from parsing a source note',()=>{
 const c=make('I finished sorting files yesterday');
 assert.equal(c.done,false);
 assert.match(e.markdown(c),/Not yet marked complete/);
});
test('source markdown stays text, including malicious looking input',()=>{
 const source='<img src=x onerror=alert(1)> hello';
 const c=make(source,'draft');
 assert.equal(c.notes[0].text,source);
 assert.match(e.markdown(c),/onerror=alert/);
});
test('saved work-card copy preserves parent identity and actual authored outcome',()=>{
 const c=make('Clean desk','sort');
 const copy=e.safeSnapshot({...c,id:'child',parent_id:'parent',version:2,
    done:true,outcome:'Actually put five objects away'});
 assert.equal(copy.id,'child'); assert.equal(copy.parent_id,'parent');
 assert.equal(copy.version,2);assert.match(e.markdown(copy),/Actually put five objects away/);
});
test('duplicate identities and unfamiliar backup schemas fail closed',()=>{
 const c=make('Do one task');
 assert.throws(()=>e.validShelf({schema:'bad',cards:[]}),/valid Solo Shelf/);
 assert.throws(()=>e.validShelf({schema:'lantern.solo-shelf/v1',cards:[{...c,id:'same'},{...c,id:'same'}]}),/Duplicate/);
});
test('unbounded input does not create unbounded task list',()=>{
 const c=make(Array.from({length:100},(_,i)=>'task '+i).join('\n'),'sort');
 assert.equal(c.notes.length,15);
});
test('plain-text source is never described as native reLATTE authority',()=>{
 const c=make('Make a grocery checklist','sort');
 assert.ok(!('signature' in c));assert.ok(!('authority' in c));
});
