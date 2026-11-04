import test from 'node:test';
import assert from 'node:assert/strict';

const URL='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-crossing-023';
const controller=()=>AbortSignal.timeout(16000);

test('live SPAWN 023 read-only launch serves full offline tool, not a substitute page',async()=>{
 const res=await fetch(URL,{headers:{accept:'text/html'},signal:controller()});
 assert.equal(res.status,200);
 const body=await res.text();
 console.log('LIVE_HTTP_DIAGNOSTIC',JSON.stringify({contentType:res.headers.get('content-type'),contentLength:body.length,starts:body.slice(0,140),csp:res.headers.get('content-security-policy'),status:res.status}));
 assert.match(res.headers.get('content-type')||'',/text\/html/);
 assert.match(res.headers.get('content-security-policy')||'',/connect-src 'none'/);
 assert.match(res.headers.get('cache-control')||'',/no-store/);
 const html=body;
 assert.match(html,/<title>JAR;VIS SPAWN 023 — reLATTE Permissioned Crossings<\/title>/);
 assert.match(html,/function worldCrossingRuntime/);
 assert.match(html,/function portableWorldHtml/);
 assert.match(html,/Export selected world \+ crossing desk/);
 assert.ok(html.length>150000,'full executable rather than placeholder');
 assert.doesNotMatch(html,/<script[^>]+src=/i);
});

test('live crossing health accurately states session-key-only, no backend writes',async()=>{
 const res=await fetch(URL+'?health=1',{signal:controller()});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.ok,true);
 assert.equal(body.version,23);
 assert.equal(body.networkWrites,0);
 assert.equal(body.physicalDeliveryVerified,false);
 assert.equal(body.verified,'SESSION_KEY_INTEGRITY_ONLY');
 assert.equal(body.cartridgeTransport,'MANUAL_SIGNED_JSON');
});

test('live crossing refuses POST; no public endpoint that can mutate production state',async()=>{
 const res=await fetch(URL,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"offer"}',signal:controller()});
 assert.equal(res.status,405);
 const body=await res.json();
 assert.equal(body.error,'READ_ONLY');
});
