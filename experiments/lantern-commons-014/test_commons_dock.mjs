import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';

const html=readFileSync(new URL('./Lantern_016_Commons_Dock.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const UUID='12345678-1234-4234-a234-1234567890ab';
const gardenReceipt={ok:true,submission:{id:UUID,status:'PENDING'},withdrawKey:'a'.repeat(43)};
const threadReceipt={schema:'abundent/invitation-thread-v1',thread:{id:UUID},ownerKey:'b'.repeat(43)};
function browser({fail=false,override={},url='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-connected-registry-001'}={}){
 const elements=new Map(),requests=[],clipboard=[],navigation=[];
 function el(id){
  if(!elements.has(id))elements.set(id,{
   id,value:'',textContent:'',checked:false,disabled:false,children:[],events:{},style:{},dataset:{},
   classList:{add(){},remove(){},toggle(){}},
   addEventListener(k,fn){this.events[k]=fn},append(...items){this.children.push(...items)},
   replaceChildren(...items){this.children=[...items]},remove(){},click(){return this.events.click?.()},
   scrollIntoView(){navigation.push(id)},querySelector(){return null}
  });
  return elements.get(id);
 }
 const suggestions=['have','need','gather','create'].map(k=>{const e=el('_'+k);e.dataset.suggest=k;return e});
 const document={getElementById:el,querySelectorAll:s=>s==='[data-suggest]'?suggestions:[],
   createElement(tag){return el('_'+tag+'_'+elements.size)},body:{append(){}}};
 const location=new URL(url),history={replaceState(_s,_t,link){navigation.push(link)}};
 const responses={
  submit:gardenReceipt,withdraw:{ok:true,removed:true},publish:threadReceipt,
  read:{schema:'abundent/invitation-conversation-v1',thread:{id:UUID,words:'Community supper'},posts:[]},
  discover:{schema:'abundent/invitation-candidates-v1',candidates:[]},
  reply:{schema:'abundent/invitation-reply-v1',post:{id:UUID},replyKey:'c'.repeat(43)},
  report:{state:'REPORTED'},'feed=1':{schema:'garden-signal/public-feed-v1',ledger:{state:'reviewed_only',entries:[]}},
  ...override
 };
 const fetch=async (path,opts)=>{
  requests.push({path,opts});
  if(fail)throw Error('Network unavailable');
  const body=opts?.body?JSON.parse(opts.body):null,operation=body?.action||(path.includes('?feed=1')?'feed=1':'none');
  const response=responses[operation];
  return {ok:!!response,json:async()=>response||{error:'UNKNOWN_OPERATION'}};
 };
 const crypto={randomUUID:()=>UUID};
 const window={},navigator={clipboard:{writeText:async s=>clipboard.push(s)}};
 const context=createContext({document,window,location,history,navigator,crypto,fetch,URL,AbortController,
  Blob,console,setTimeout:()=>1,clearTimeout(){},confirm:()=>true});
 new Script(scripts[0][1],{filename:'commons-dock.js'}).runInContext(context);
 return {el,window,requests,clipboard,navigation};
}
const submit=(c,form)=>c.el(form).events.submit({preventDefault(){}});
test('single self-contained mobile-friendly HTML app; no third-party scripts',()=>{
 assert.equal(scripts.length,1);
 assert.match(html,/<meta name="viewport"/);
 assert.doesNotMatch(html,/<script[^>]+src=/);
 assert.doesNotMatch(html,/innerHTML\s*=/);
 assert.match(html,/garden-signal/);
 assert.match(html,/invitation-network-002/);
 assert.match(html,/now-route-live/);
 assert.match(html,/agent-commons-frontdoor-016/);
 assert.match(html,/banana-pocket/);
 assert.match(html,/\/functions\/v1\/poke/);
 assert.match(html,/social-porch/);
 assert.match(html,/jarvis-solo-live-017/);
});
test('nothing calls a network until explicit user action; local router leads to real capability',()=>{
 const c=browser();
 assert.equal(c.requests.length,0);
 const r=c.window.JARVIS_COMMONS_002.routeIntent('I have extra canned beans to give today.');
 assert.equal(r.kind,'exchange');
 assert.equal(c.window.JARVIS_COMMONS_002.routeIntent('I want to invite volunteers to a church potluck').where,'conversation');
 assert.equal(c.window.JARVIS_COMMONS_002.routeIntent('I want to make a new song').kind,'make');
 assert.equal(c.window.JARVIS_COMMONS_002.routeIntent('Check my GHoT cluster').kind,'build');
 c.el('intent').value='Help arrange a volunteer concert';
 c.el('route').click();
 assert.equal(c.requests.length,0);
 assert.match(c.el('route-result').textContent,/persistent conversation/);
});
test('Garden is a real private HOLD only, with receipt and never public auto-publication',async()=>{
 const c=browser();c.el('garden-kind').value='need';c.el('garden-body').value='We need some help moving chairs';c.el('garden-next').value='Ask for a willing volunteer';
 c.el('garden-consent').checked=true;
 await submit(c,'garden-form');
 assert.equal(c.requests.length,1);
 assert.equal(c.requests[0].path,'/functions/v1/garden-signal');
 const sent=JSON.parse(c.requests[0].opts.body);
 assert.deepEqual({...sent},{action:'submit',kind:'need',lane:'commons',body:'We need some help moving chairs',nextStep:'Ask for a willing volunteer',consentToReview:true});
 assert.equal(c.window.JARVIS_COMMONS_002.status().receivedGarden,true);
 assert.match(c.el('garden-status').textContent,/PRIVATE REVIEW/);
 assert.match(c.el('garden-private').textContent,/withdrawKey/);
 assert.doesNotMatch(JSON.stringify(c.requests),/ownerKey|privateOwnerKey/);
});
test('Garden reviewed public read filters only from explicit existing feed endpoint',async()=>{
 const c=browser({override:{'feed=1':{schema:'garden-signal/public-feed-v1',ledger:{state:'reviewed_only',entries:[
 {kind:'offer',lane:'commons',body:'I have a nice printable chart',createdAt:'2026-11-04'}
 ]}}}});
 assert.equal(c.requests.length,0);
 await c.el('feed-read').events.click();
 assert.equal(c.requests[0].path,'/functions/v1/garden-signal?feed=1');
 assert.match(c.el('feed-items').children[0].children[1].textContent,/nice printable chart/);
 assert.match(c.el('feed-status').textContent,/reviewed public/);
});
test('public conversation is truly sent to existing service with independent consent and owner key kept out of public URL',async()=>{
 const c=browser();c.el('thread-words').value='Who would help at a Friday potluck?';
 c.el('thread-lane').value='food';c.el('thread-time').value='soon';c.el('thread-intent').value='need';c.el('thread-consent').checked=true;
 await submit(c,'thread-form');
 assert.equal(c.requests[0].path,'/functions/v1/invitation-network-002');
 const b=JSON.parse(c.requests[0].opts.body);
 assert.equal(b.action,'publish');assert.equal(b.invitationId,UUID.replace(/-/g,''));
 assert.equal(b.words,'Who would help at a Friday potluck?');
 assert.equal(b.lane,'food');assert.equal(b.timing,'soon');assert.equal(b.intent,'need');assert.equal(b.consent,true);
 assert.equal(JSON.parse(c.requests[1].opts.body).action,'read');
 assert.match(c.el('thread-status').textContent,/PUBLISHED PUBLICLY/);
 assert.match(c.el('thread-keys').textContent,/privateOwnerKey/);
 assert.doesNotMatch(c.el('thread-keys').textContent.split('\n')[0],/bbbbbbbb/);
 assert.equal(c.window.JARVIS_COMMONS_002.status().thread,UUID);
 assert.ok(c.navigation.some(x=>String(x).includes('?thread='+UUID)));
});
test('public discovery is actual search and a safe failure is not called success',async()=>{
 const c=browser();await c.window.JARVIS_COMMONS_002.discover();
 assert.equal(JSON.parse(c.requests[0].opts.body).action,'discover');
 assert.match(c.el('threads-status').textContent,/0 public threads/);
 const unavailable=browser({fail:true});await unavailable.window.JARVIS_COMMONS_002.discover();
 assert.match(unavailable.el('threads-status').textContent,/Could not discover/);
});
test('replies and safety reports are separate actions; owner can withdraw using private receipt',async()=>{
 const c=browser();
 await c.window.JARVIS_COMMONS_002.readThread(UUID);
 c.el('reply-kind').value='offer';c.el('reply-words').value='I can help move chairs.';c.el('reply-consent').checked=true;
 await submit(c,'reply-form');
 assert.equal(JSON.parse(c.requests[1].opts.body).action,'reply');
 assert.ok(c.clipboard.some(x=>x.includes('privateReplyKey')));
 c.el('withdraw-id').value=UUID;c.el('withdraw-key').value='b'.repeat(43);
 await c.el('withdraw-thread').events.click();
 assert.equal(JSON.parse(c.requests.at(-1).opts.body).action,'withdraw');
 assert.equal(JSON.parse(c.requests.at(-1).opts.body).postId,null);
 assert.match(c.el('withdraw-status').textContent,/WITHDRAWN/);
});
