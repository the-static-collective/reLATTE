import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../cartridges/any-invitation-001.json',import.meta.url),'utf8')) as {
 schema:string; id:string; authority:string; remote_execution:boolean; automatic_propagation:boolean;
 automatic_notifications:boolean; persistent_identity:boolean; preferred_time:string; possible_responses:Array<{
 id:string; side_effect:string; needs_permission:boolean; kinds:string[]
 }>; kinds:string[]; time_modes:string[]; laws:string[];
 external_delivery:string; sender_reply_delivery:string;
 learning:{mode:string;default_enabled:boolean;raw_content_retention:boolean}
};
test('the general invitation cartridge is an inert, bounded organ proposal',()=>{
 assert.equal(c.schema,'relatte.any-invitation-cartridge/v0');
 assert.equal(c.authority,'PROPOSAL_ONLY');
 assert.equal(c.remote_execution,false);
 assert.equal(c.automatic_propagation,false);
 assert.equal(c.automatic_notifications,false);
 assert.equal(c.persistent_identity,false);
 assert.equal(c.external_delivery,'NOT_IMPLEMENTED');
 assert.equal(c.sender_reply_delivery,'NOT_IMPLEMENTED');
 assert.deepEqual(c.time_modes,['now','soon','open']);
 assert.equal(c.preferred_time,'now');
});
test('all six paths remain voluntary and may not silently send to recipients',()=>{
 assert.deepEqual(c.possible_responses.map(x=>x.id).sort(),['act','decline','fork','offer','pass','question'].sort());
 assert.equal(c.possible_responses.find(x=>x.id==='pass')?.side_effect,'EXPLICIT_HUMAN_SHARE');
 assert.equal(c.possible_responses.find(x=>x.id==='decline')?.side_effect,'NO_RECORD');
 assert.equal(c.possible_responses.find(x=>x.id==='act')?.side_effect,'NONE_UNTIL_HUMAN_ACTION');
 assert.equal(c.possible_responses.every(x=>x.kinds.length===c.kinds.length),true);
});
test('no simulated engagement learning can become autonomous social distribution',()=>{
 assert.deepEqual(c.learning,{mode:'EXPLICIT_LOCAL_ONLY',default_enabled:false,raw_content_retention:false});
 assert.ok(c.laws.includes('PROPAGATION != CONSENT'));
 assert.ok(c.laws.includes('REFUSAL != PENALTY'));
 assert.ok(c.laws.includes('LINK != SIGNATURE'));
 assert.ok(c.laws.includes('NOW_PREFERRED != NOW_ASSUMED'));
});
