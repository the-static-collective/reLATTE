import test from 'node:test';
import assert from 'node:assert/strict';

const URL='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-crossing-023';
const signal=()=>AbortSignal.timeout(16000);

test('live SPAWN 023 API root honestly advertises download-only HTML artifact',async()=>{
 const res=await fetch(URL,{signal:signal()});
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type')||'',/application\/json/);
 const body=await res.json();
 assert.equal(body.schema,'relatte-crossing-artifact/v1');
 assert.equal(body.status,'DOWNLOAD_ONLY_NOT_HOSTED_HTML');
 assert.equal(body.download,'/functions/v1/relatte-crossing-023/download');
 assert.match(body.notes,/standalone offline file/);
});

test('live HTTPS download returns the actual full standalone app as attachment, without pretending to host HTML',async()=>{
 const res=await fetch(URL+'/download',{signal:signal()});
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type')||'',/application\/octet-stream/);
 assert.match(res.headers.get('content-disposition')||'',/attachment/);
 assert.match(res.headers.get('content-disposition')||'',/SPAWN_023_Permissioned_Crossings\.html/);
 assert.match(res.headers.get('cache-control')||'',/no-store/);
 const file=await res.text();
 assert.ok(file.length>150000);
 assert.match(file,/<title>JAR;VIS SPAWN 023 — reLATTE Permissioned Crossings<\/title>/);
 assert.match(file,/function worldCrossingRuntime/);
 assert.match(file,/function portableWorldHtml/);
 assert.match(file,/Export selected world \+ crossing desk/);
 assert.doesNotMatch(file,/<script[^>]+src=/i);
});

test('live health is explicit about session key verification, manual transport and no backend writes',async()=>{
 const res=await fetch(URL+'?health=1',{signal:signal()});
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.ok,true);
 assert.equal(body.version,23);
 assert.equal(body.networkWrites,0);
 assert.equal(body.physicalDeliveryVerified,false);
 assert.equal(body.verified,'SESSION_KEY_INTEGRITY_ONLY');
 assert.equal(body.cartridgeTransport,'MANUAL_SIGNED_JSON');
 assert.equal(body.htmlGetSupported,false);
});

test('live crossing refuses POST and cannot mutate production state',async()=>{
 const res=await fetch(URL,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"offer"}',signal:signal()});
 assert.equal(res.status,405);
 const body=await res.json();
 assert.equal(body.error,'READ_ONLY');
});
