import test from 'node:test';
import assert from 'node:assert/strict';
const BASE='https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-app-025';
const signal=()=>AbortSignal.timeout(16000);
test('live standalone 025 downloadable app returns original complete executor, not a placeholder',async()=>{
 const res=await fetch(BASE+'/download',{signal:signal()});
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type')||'',/application\/octet-stream/);
 assert.match(res.headers.get('content-disposition')||'',/attachment.*SPAWN_025_Solo_Connector_Workbench\.html/);
 assert.match(res.headers.get('cache-control')||'',/no-store/);
 const html=await res.text();
 assert.ok(html.length>195000);
 assert.match(html,/<title>JAR;VIS SPAWN 025 — Solo Work Executor \+ Provider Bridge<\/title>/);
 assert.match(html,/function constructSoloArtifact/);
 assert.match(html,/function providerIntent/);
 assert.match(html,/relatte\/solo-capability-circuit\/v1/);
 assert.match(html,/id="executor-025"/);
 assert.match(html,/No tokens, secrets or external API calls are used by this section/);
 assert.doesNotMatch(html,/<script[^>]+src=|\bSUPABASE_SERVICE_ROLE_KEY\b|sb_secret_/);
});
test('live 025 origin clearly discloses no configured provider OAuth or remote save',async()=>{
 const res=await fetch(BASE+'?health=1',{signal:signal()});
 assert.equal(res.status,200);
 const obj=await res.json();
 assert.equal(obj.ok,true);assert.equal(obj.version,25);
 assert.equal(obj.delivery,'HTML_ATTACHMENT_ONLY');
 assert.equal(obj.externalOAuthConfigured,false);
 assert.equal(obj.networkWrites,0);
 assert.equal(obj.artifactExecutor,true);
 assert.equal(obj.providerIntents,'CREATE_NEW_ONLY');
 assert.equal(obj.physicalOutcomeVerified,false);
});
test('live app delivery endpoint is GET-only and refuses file creation POST',async()=>{
 const res=await fetch(BASE,{method:'POST',body:'{"save":true}',headers:{'content-type':'application/json'},signal:signal()});
 assert.equal(res.status,405);
 const d=await res.json();assert.equal(d.error,'READ_ONLY');
});
