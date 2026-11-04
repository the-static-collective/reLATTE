import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const html=readFileSync(new URL('./Lantern_015_Connected_Desk.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const ROOT='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-live-bridge-001';
const manifest={ok:true,mode:'PUBLIC_READ_ONLY',writes_enabled:false,remote_agent_execution:false,
 user_work_received:false,targets:{jarvis:{repo:'JAR-VIS'},relatte:{repo:'reLATTE'},ghot:{repo:'GHoT'},planz:{repo:'planZ'}},
 offers:[{id:'inspect_public_source',execution:'CONNECTED_NOW'},{id:'check_public_ci',execution:'CONNECTED_NOW'}]};
const digest='a'.repeat(64);
const result={ok:true,action:'inspect',target:'planz',writes_performed:0,user_work_received:false,
 observed_at:'2026-11-04T19:00:00Z',repository:'the-static-collective/planZ',
 sha256:digest,source_bytes:200,source_url:'https://raw.githubusercontent.com/the-static-collective/planZ/main/README.md',excerpt:'Actual public README'};
function browser({approve=true,fail=false,offer='Need volunteers for an event'}={}){
 const nodes=new Map(),requests=[],dialogs=[];
 function element(id){
  if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',disabled:false,href:'',children:[],events:{},
    classList:{add(){},remove(){},toggle(){}},append(...xs){this.children.push(...xs);},
    replaceChildren(...xs){this.children=[...xs];},addEventListener(k,fn){this.events[k]=fn;},
    click(){return this.events.click?.()},setAttribute(){}});
  return nodes.get(id);
 }
 const document={getElementById:element,createElement(tag){const e=element('_'+tag+'_'+nodes.size);e.tag=tag;return e;}};
 const fetch=async(url,opts)=>{
  requests.push({url,opts});
  if(fail)throw Error('Network unavailable');
  if(url===ROOT)return {ok:true,json:async()=>manifest};
  if(url===ROOT+'?action=inspect&target=planz')return {ok:true,json:async()=>result};
  return {ok:true,json:async()=>({ok:true,action:'ci',target:'planz',writes_performed:0,
    user_work_received:false,observed_at:'2026-11-04T19:01:00Z',repository:'the-static-collective/planZ',runs:[]})};
 };
 const window={LANTERN014:{status:()=>({active:{problem:offer,note:'PRIVATE_SURVIVOR_NOTES',evidence:'PRIVATE_EVIDENCE'}})}};
 const sandbox=createContext({document,window,fetch,console,AbortController,
   setTimeout(){return 1;},clearTimeout(){},confirm(msg){dialogs.push(msg);return approve;}});
 new Script(scripts[1][1],{filename:'connected-desk.js'}).runInContext(sandbox);
 return {element,window,requests,dialogs};
}
test('offline Solo Desk retained exactly, connected script loads only after main local script',()=>{
 const original=readFileSync(new URL('./Lantern_014_The_Solo_Desk.html',import.meta.url),'utf8');
 assert.equal(scripts.length,2);
 assert.ok(html.includes(original.match(/const KEY='lantern014_solo_desk_v1'/)[0]));
 assert.match(html,/id="jarvis-audit"/);
 assert.match(html,/id="connected-discover"/);
 assert.match(html,/No connection starts automatically/);
});
test('nothing leaves browser automatically; local matching is only a suggestion',()=>{
 const c=browser();
 assert.equal(c.requests.length,0);
 assert.equal(c.window.CONNECTED001.suggest('My laptop cluster is broken'),'ghot');
 assert.equal(c.window.CONNECTED001.suggest('Build a Minecraft cartridge'),'relatte');
 assert.equal(c.window.CONNECTED001.suggest('Plan a community event'),'planz');
 assert.equal(c.window.CONNECTED001.suggest('a question'),'jarvis');
 assert.equal(c.window.CONNECTED001.status().loaded,false);
});
test('explicit discovery fetches registry WITHOUT private notes or intent',async()=>{
 const c=browser();await c.window.CONNECTED001.discover();
 assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,ROOT);
 assert.equal(c.requests[0].opts.method,'GET');
 assert.equal(c.requests[0].opts.credentials,'omit');
 assert.equal(c.requests[0].opts.referrerPolicy,'no-referrer');
 assert.equal(c.element('connected-target').value,'planz');
 assert.equal(c.element('connected-inspect').disabled,false);
 assert.equal(c.element('connected-ci').disabled,false);
 assert.equal(c.window.CONNECTED001.status().loaded,true);
 assert.doesNotMatch(JSON.stringify(c.requests),/PRIVATE_SURVIVOR_NOTES|PRIVATE_EVIDENCE|volunteers/);
});
test('each external read needs separate user approval; only two allowlisted arguments sent',async()=>{
 const c=browser();await c.window.CONNECTED001.discover();
 await c.window.CONNECTED001.run('inspect');
 assert.equal(c.dialogs.length,1);
 assert.equal(c.requests[1].url,ROOT+'?action=inspect&target=planz');
 assert.equal(c.requests[1].opts.method,'GET');
 assert.doesNotMatch(JSON.stringify(c.requests),/PRIVATE_SURVIVOR_NOTES|PRIVATE_EVIDENCE|volunteers/);
 assert.match(c.element('connected-result').children.map(x=>x.textContent).join(' '),/READ-ONLY ACTION EXECUTED/);
 assert.ok(c.element('connected-result').children.some(x=>x.href.startsWith('https://raw.githubusercontent.com')));
 await c.window.CONNECTED001.run('ci');
 assert.equal(c.dialogs.length,2);
 assert.equal(c.requests[2].url,ROOT+'?action=ci&target=planz');
});
test('refusal, outage and unavailable registry never claim success',async()=>{
 const declined=browser({approve:false});await declined.window.CONNECTED001.discover();
 await declined.window.CONNECTED001.run('inspect');assert.equal(declined.requests.length,1);
 const failed=browser({fail:true});await failed.window.CONNECTED001.discover();
 assert.equal(failed.window.CONNECTED001.status().loaded,false);
 assert.match(failed.element('connected-state').textContent,/UNAVAILABLE/);
 assert.match(failed.element('connected-result').children.map(x=>x.textContent).join(' '),/No connected action was performed/);
});
test('never executes arbitrary action even when asked by caller',async()=>{
 const c=browser();await c.window.CONNECTED001.discover();
 await c.window.CONNECTED001.run('post-message');
 assert.equal(c.requests.length,1);assert.equal(c.dialogs.length,0);
 assert.equal(c.element('connected-result').children.at(-1).textContent,'Unsupported operation. No request sent.');
});
