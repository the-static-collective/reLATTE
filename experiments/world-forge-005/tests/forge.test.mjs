import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeCandidate,validateDonor,validateCandidate} from '../src/forge.mjs';
import {HASH,FORMAT} from '../../world-forge-004/src/verify.mjs';

const base={alpha:'minecraft:moss_block',beta:'minecraft:cut_copper'};
const observer={alpha:'WFWatchAlpha',beta:'WFWatchBeta'};
const station={alpha:'garden',beta:'forge'};
const seed={alpha:'381654729',beta:'918273645'};
const raw=world=>{
 const evidence={
   format:FORMAT,source_sha256:HASH,engine:'minecraft-java-26.1.1',
   instance:world,seed:seed[world],engine_version:'26.1.1',
   observer:observer[world],observer_class:'NON_OP_SEPARATE_PROCESS_PROTOCOL_CLIENT',
   observer_unprivileged:true,
   observations:[{stage:'build',block:base[world]},
    {stage:'impact',block:'minecraft:polished_blackstone'},
    {stage:'repair',block:base[world]}],
   actions:['BUILD','IMPACT','REPAIR'],artifact_digests:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],
   receiver:'HOLD',signature:null
 };
 const commands=[
   'forceload add -32 -32 32 32',
   'tp '+observer[world]+' 0 80 0',
   'execute positioned 0 80 0 run function worldforge:build_'+world,
   'execute positioned 0 80 0 run function crater:impact_'+world,
   'execute positioned 0 80 0 run function crater:visual_repair_'+world+'_'+station[world]
 ];
 const trace={operator:'RCON',observer:observer[world],observer_ops_file_verified:true,
   server_sha1:'1'.repeat(40),source_sha256:HASH,
   commands:commands.map(command=>({role:'OPERATOR_RCON',command,response:'ok'})),
   worker_stderr:'',receiver:'HOLD'};
 return make(evidence,trace);
};
const make=(evidence,trace)=>({evidence,trace,evidence_bytes:JSON.stringify(evidence)+'\n',trace_bytes:JSON.stringify(trace)+'\n'});
const pair=()=>({alpha:raw('alpha'),beta:raw('beta')});
const update=(world,fn)=>{const d=pair();fn(d[world].evidence,d[world].trace);d[world]=make(d[world].evidence,d[world].trace);return d;};
test('two source donor action/observer histories infer two-step candidate held',()=>{
 const c=forgeCandidate(pair()); assert.equal(c.grammar.operations.length,2);
 assert.equal(c.replay_env.base_material,'minecraft:gold_block');assert.equal(c.disposition,'HOLD');
 assert.equal(c.execution_permission,false);assert.notEqual(c.donors.alpha.base,c.donors.beta.base);
 assert.equal(validateCandidate(c),true);
});
test('reject omitted intermediate observed state',()=>assert.throws(()=>forgeCandidate(update('alpha',(e)=>e.observations.splice(1,1)))));
test('reject forged positive state',()=>assert.throws(()=>forgeCandidate(update('alpha',(e)=>e.observations[1].block=base.alpha))));
test('reject no true repair',()=>assert.throws(()=>forgeCandidate(update('beta',(e)=>e.observations[2].block='minecraft:polished_blackstone'))));
test('reject operator claiming observer',()=>assert.throws(()=>forgeCandidate(update('alpha',(e,t)=>t.observer='operator'))));
test('reject observer promoted to op',()=>assert.throws(()=>forgeCandidate(update('alpha',(e,t)=>t.observer_ops_file_verified=false))));
test('reject swapped action order',()=>assert.throws(()=>forgeCandidate(update('beta',(e,t)=>[t.commands[3],t.commands[4]]=[t.commands[4],t.commands[3]]))));
test('reject arbitrary command injection',()=>assert.throws(()=>forgeCandidate(update('alpha',(e,t)=>t.commands[3].command='execute run function evil:run'))));
test('reject fake author trace',()=>assert.throws(()=>forgeCandidate(update('alpha',(e,t)=>t.commands[1].role='OBSERVATION'))));
test('reject failed author command',()=>assert.throws(()=>forgeCandidate(update('alpha',(e,t)=>t.commands[4].response='unknown function'))));
test('reject absent raw original bytes',()=>{const d=pair();d.alpha.evidence_bytes='{}';assert.throws(()=>forgeCandidate(d))});
test('reject source hash drift',()=>assert.throws(()=>forgeCandidate(update('beta',(e)=>e.source_sha256='0'.repeat(64)))));
test('reject forged signature/authority',()=>{const c=forgeCandidate(pair());c.signature='sig';assert.throws(()=>validateCandidate(c))});
test('reject admission',()=>{const c=forgeCandidate(pair());c.disposition='ADMIT';assert.throws(()=>validateCandidate(c))});
test('reject executable carte blanche',()=>{const c=forgeCandidate(pair());c.execution_permission=true;assert.throws(()=>validateCandidate(c))});
test('reject changing target to donor geometry',()=>{const c=forgeCandidate(pair());c.replay_env.position=[-8,79,-7];assert.throws(()=>validateCandidate(c))});
test('reject changing target to donor material',()=>{const c=forgeCandidate(pair());c.replay_env.base_material=base.alpha;assert.throws(()=>validateCandidate(c))});
test('reject unknown cartridge verb',()=>{const c=forgeCandidate(pair());c.grammar.operations[1].verb='RUN_SHELL';assert.throws(()=>validateCandidate(c))});
test('reject case where both donors report one source material',()=>assert.throws(()=>forgeCandidate(update('beta',(e)=>{e.observations[0].block=base.alpha;e.observations[2].block=base.alpha}))));
test('reject partial lineage',()=>{const d=pair();delete d.beta;assert.throws(()=>forgeCandidate(d))});
test('reject extraneous field in source action trace',()=>assert.throws(()=>forgeCandidate(update('beta',(e,t)=>t.magic='TOKEN'))));
test('reject duplicate donor observer name',()=>assert.throws(()=>forgeCandidate(update('beta',(e)=>e.observer=observer.alpha))));
