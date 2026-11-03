// Playwright automated click-through of the *built* offline single-file UI.
// Executes in a localhost-origin browser only to enable persistence; console itself
// has a strict connect-src 'none' CSP and never contacts localhost.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {verifySigned,evaluateGrant} from '../src/delegation-core.mjs';

const url=process.env.WF008_BROWSER_URL||'http://127.0.0.1:8765/WORLD-FORGE-008-OWNER-CONSOLE.html';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/'))external.push(r.url())});
 await page.goto(url,{waitUntil:'load'});
 assert.match(await page.locator('#status').innerText(),/Ready/);
 assert.match(await page.locator('main').innerText(),/Your key/);
 await page.getByRole('button',{name:'Create local signer'}).click();
 assert.match(await page.locator('#identity-state').innerText(),/nonexportable/);
 assert.match(await page.locator('#fingerprint').innerText(),/SHA-256 [a-f0-9]{64}/);
 await page.getByRole('button',{name:'Sign scoped project delegation'}).click();
 assert.match(await page.locator('#status').innerText(),/Signed/);
 const parsed=JSON.parse(await page.locator('#grant-preview').innerText());
 assert.equal(await verifySigned(parsed),true);
 assert.equal((await evaluateGrant({grant:parsed,at:new Date().toISOString(),action:'PROPOSE_PULL_REQUEST'})).authorized,true);
 const p=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download signed public grant'}).click();
 const dl=await p;
 assert.equal(dl.suggestedFilename(),'WF008-signed-project-delegation.json');
 const publicText=readFileSync(await dl.path(),'utf8');
 const saved=JSON.parse(publicText);
 assert.equal(await verifySigned(saved),true);
 assert.equal(Object.hasOwn(saved,'private_jwk'),false);
 assert.equal(JSON.stringify(saved).includes('"d":'),false);
 await page.reload({waitUntil:'load'});
 assert.match(await page.locator('#identity-state').innerText(),/nonexportable/);
 assert.equal((await page.locator('#create').isDisabled()),true);
 await page.getByRole('button',{name:'Sign revocation of this grant'}).click();
 assert.match(await page.locator('#status').innerText(),/Revocation signed/);
 const rev=JSON.parse(await page.locator('#revocation-preview').innerText());
 assert.equal(await verifySigned(rev),true);
 assert.equal((await evaluateGrant({grant:parsed,at:new Date().toISOString(),action:'PROPOSE_PULL_REQUEST',
   revocations:[rev]})).reason,'REVOKED_BY_OWNER');
 const rp=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download signed revocation'}).click();
 assert.equal((await rp).suggestedFilename(),'WF008-signed-project-revocation.json');
 await page.reload({waitUntil:'load'});
 await page.getByRole('button',{name:'Verify this browser\'s signatures and policy'}).click();
 assert.match(await page.locator('#status').innerText(),/REVOKED_BY_OWNER/);
 assert.deepEqual(external,[],'no outgoing network requests');
 assert.deepEqual(errors,[],'zero JavaScript page errors');
 console.log('WORLD_FORGE_008_BROWSER_SMOKE='+JSON.stringify({
   new_nonexportable_owner_key:true,public_fingerprint_seen:true,
   source_signature_verified:true,public_json_downloaded:true,
   indexeddb_persists_across_reload:true,revocation_signed:true,
   revoked_grant_rejected:true,unexpected_external_requests:external.length,
   page_errors:errors.length,automatic_merge:false,automatic_execution:false
 }));
 await context.close();
}finally{await browser.close()}
