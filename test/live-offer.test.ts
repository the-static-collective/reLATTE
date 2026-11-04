import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../cartridges/live-offer-001.json',import.meta.url),'utf8')) as Record<string,any>;
test('cartridge is inert and explicitly has no reLATTE authority',()=>{
 assert.equal(c.schema,'relatte.live-offer-cartridge/v0');assert.equal(c.authority,'PROPOSAL_ONLY');assert.equal(c.remote_execution,false);
 assert.equal(c.id,'jubilee-live-offer-001');assert.ok(c.laws.includes('NOW_IS_PROPOSED_NOT_ASSUMED'));
 assert.equal(c.actions.find((a:Record<string,any>)=>a.id==='record-audio').effect,'audio-file');
 assert.equal(c.actions.find((a:Record<string,any>)=>a.id==='private-offer').effect,'private-receipt');
 for(const action of c.actions){assert.ok(action.next.every((id:string)=>c.actions.some((x:Record<string,any>)=>x.id===id)));}
});
