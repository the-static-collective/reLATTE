import { fork, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { now } from '../../src/useful_work/cli_io.ts';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { offerTerms } from '../../src/useful_work/field_test/profile.ts';
import { inspectPlan, scheduleSlot } from '../../src/useful_work/audit_clock/policy.ts';
import { createAudit } from '../../src/useful_work/audit/accumulator.ts';
import { inspectNativeWork } from '../../src/useful_work/merkle_native/exchange.ts';
import { inspectCommitment } from '../../src/useful_work/service/commitment.ts';
import { serviceHttpServer } from '../../src/useful_work/service/http.ts';
import { verifyExchange } from '../../src/useful_work/settlement/exchange.ts';
import { inspectMessage as inspectWire, assert } from '../../src/useful_work/wire_field/message.ts';
import { atomic, optional, readJson } from '../../src/useful_work/wire_field/store.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';
import type { WorldRole } from '../../src/useful_work/field_test/profile.ts';
import { Peer } from './peer.ts';

const ext = import.meta.url.endsWith('.js') ? 'js' : 'ts';
const actorPath = fileURLToPath(new URL(`../useful-work-field-001/actor.${ext}`, import.meta.url));
const ledgerPath = fileURLToPath(new URL(ext === 'js' ? '../../../examples/useful-work-field-001/ledger.py' : '../useful-work-field-001/ledger.py', import.meta.url));
export async function actor(command: string, role: WorldRole, root: string, input: Wire, label: string) {
  assert(/^[a-zA-Z0-9_-]{1,128}$/.test(label),'INVALID_WIRE_LOCAL_DOMAIN_LABEL');
  await mkdir(join(root, 'domain'), { recursive: true, mode: 0o700 });
  const inputPath = join(root, 'domain', label + '-input.json'), outputPath = join(root, 'domain', label + '-output.json');
  const old = await optional(outputPath); if (old !== null) return old;
  await atomic(inputPath, input);
  if (command === 'produce') for (const p of ['artifact.json','cpu.json']) await rm(join(root, 'local',p), { force:true });
  if (command === 'network-start' && await optional(join(root, 'local/network-start.json'))) return { captured: true };
  return new Promise<Wire>((yes, no) => {
    const child = fork(actorPath, [command, role, root, inputPath, outputPath], { cwd: root, silent: true, execArgv: ['--experimental-strip-types'] });
    let stderr = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); no(new Error('WIRE_LOCAL_DOMAIN_TIMEOUT')); }, 90000);
    child.stdout!.resume(); child.stderr!.on('data', b => { if (stderr.length < 4096) stderr += b.toString(); });
    if (command === 'produce') child.on('message', (m: any) => { if (m.kind === 'ready') child.send({ kind:'run' }); if (m.kind === 'produced') child.send({ kind:'stop' }); });
    child.once('error', e => { clearTimeout(timer); no(e); });
    child.once('close', async code => { clearTimeout(timer); if (code !== 0) no(new Error(`WIRE_LOCAL_DOMAIN_FAILED ${role}/${command}: ${stderr.trim()}`)); else try { yes(await readJson(outputPath)); } catch (e) { no(e); } });
  });
}

export class Trade {
  readonly peer:Peer;
  constructor(peer: Peer) { this.peer=peer;peer.handler = m => this.handle(m); peer.progress = () => this.progress(); }
  get role() { return this.peer.role; }
  get config() { return this.peer.config; }
  get packet() { return this.peer.first('packet')?.body ?? null; }
  command(label: string, command: string, input: Wire) { return actor(command, this.role, this.config.root, input, label); }
  send(label: string, topic: string, recipients: WorldRole[], body: unknown, deps: string[] = []) { return this.peer.emit(label, topic, recipients, body, deps); }
  id(topic: string) { return this.peer.first(topic)!.crossing.crossing_id as string; }
  messages(topic: string) { return this.peer.list(topic); }
  async initialize() {
    if (this.config.door_market && this.role === 'B') {
      this.peer.marketHandler = async (_req,res) => {
        const listing = await optional(join(this.config.root,'market/listing.json'));
        res.writeHead(listing ? 200 : 503, {'content-type':'application/json'}).end(JSON.stringify(listing ?? {error:'No local door publication yet.'}));
      };
    }
    if (this.role === 'A') {
      const packet = await this.command('produce','produce',{ job_spec: this.config.job_spec });
      await this.command('network-start','network-start',{ interface_name: this.config.network_interface });
      const id = await this.send('packet','packet',['B','C','D','adapter'],packet);
      await this.send('notice','notice',['B','C'],{ result_id: packet.native.work.extensions.organ_adapter.donor_claims.useful_work_native.result_id, note: 'This announcement depends on the separately delivered artifact packet.' },[id]);
    } else if (this.role === 'adapter') {
      const state = join(this.config.root,'ledger/state.json'); await mkdir(join(this.config.root,'ledger'),{recursive:true,mode:0o700});
      if (!(await optional(state))) await this.ledger('init',[]);
    }
    await this.restoreService();
  }
  private async ledger(command: string, args: string[]) {
    await new Promise<void>((yes,no) => {
      const child = spawn('python3',['-I','-B',ledgerPath,command,join(this.config.root,'ledger/state.json'),...args],{cwd:this.config.root,stdio:['ignore','ignore','pipe']});
      let stderr=''; child.stderr.on('data',b=>{if(stderr.length<4096) stderr+=b.toString();}); child.once('error',no); child.once('close',code=>code===0?yes():no(new Error('WIRE_SEPARATE_LEDGER_FAILED: '+stderr)));
    });
  }
  async restoreService() {
    if (this.role !== 'A' || !this.packet || !this.peer.first('service-commit')) return;
    const plan = this.peer.first('service-plan')!.body.plan, commitment = this.peer.first('service-commit')!.body.commitment;
    const n = await inspectNativeWork(this.packet.native.work,canonicalBytes(this.packet.job_spec)), s = await inspectCommitment(n,plan,commitment);
    const server = serviceHttpServer(async()=>s,Buffer.from(this.packet.native.artifact_base64,'base64'),this.peer.keys);
    this.peer.nativeHandler = (req,res)=>{const endpoint=new URL(s.declaration.endpoint);req.url=endpoint.pathname+endpoint.search;server.emit('request',req,res);};
  }
  async handle(message: Wire) {
    const m = await inspectWire(message,this.config.run_id,this.config.peers,this.role), b=m.body, deps=[m.id];
    if(['audit-event','audit-issue','audit-response','audit-receipt','service-event','service-challenge'].includes(m.claims.topic))assert(Number.isSafeInteger(b.slot)&&b.slot>=0&&b.slot<2,'INVALID_WIRE_FIELD_SLOT');
    if (m.claims.topic === 'notice') return;
    if (m.claims.topic === 'packet' && ['B','C'].includes(this.role)) {
      const receipt=await this.command('legacy-full','legacy-check',{packet:b});
      await this.send('legacy-full','legacy-full-receipt',this.role==='B'?['A','C']:['A','B'],{receipt},deps);
    } else if (m.claims.topic === 'legacy-challenge' && this.role==='A') {
      const response=await this.command('legacy-response','legacy-answer',{packet:this.packet,challenge:b.challenge});
      await this.send('legacy-response','legacy-response',['B','C'],{challenge:b.challenge,response},[m.id,this.id('packet')]);
    } else if (m.claims.topic === 'legacy-response' && ['B','C'].includes(this.role)) {
      const receipt=await this.command('legacy-sample','legacy-sample-check',{packet:this.packet,challenge:b.challenge,response:b.response});
      await this.send('legacy-sample','legacy-sample-receipt',this.role==='B'?['A','C']:['A','B'],{receipt},deps);
    } else if (m.claims.topic === 'audit-event' && this.role==='B') {
      const plan=this.peer.first('audit-plan')!.body;
      const issue=await this.command('audit-issue-'+b.slot,'audit-issue',{packet:this.packet,...plan,event:b.event});
      await this.send('audit-issue-'+b.slot,'audit-issue',['A','C','D'],{slot:b.slot,...plan,event:b.event,issue},[this.id('audit-plan')]);
    } else if (m.claims.topic === 'audit-issue' && this.role==='A') {
      const response=await this.command('audit-response-'+b.slot,'audit-answer',{packet:this.packet,challenge:b.issue.challenge});
      await this.send('audit-response-'+b.slot,'audit-response',b.slot===0?['B','C','D']:['B','C'],{...b,response},[m.id,this.id('packet')]);
    } else if (m.claims.topic === 'audit-response' && ['B','C','D'].includes(this.role) && !(this.role==='D' && b.slot!==0)) {
      const receipt=await this.command('audit-receipt-'+b.slot,'native-check',{packet:this.packet,challenge:b.issue.challenge,response:b.response});
      await this.send('audit-receipt-'+b.slot,'audit-receipt',this.role==='B'?['A','C']:['B'],{slot:b.slot,receipt},deps);
    } else if (m.claims.topic === 'service-plan' && this.role==='A') {
      const commitment=await this.command('service-commit','service-commit',{packet:this.packet,plan:b.plan,endpoint:this.config.service_endpoint});
      await this.send('service-commit','service-commit',['B'],{plan:b.plan,commitment},deps); await this.restoreService();
    } else if (m.claims.topic === 'service-commit' && this.role==='B') {
      const publication=await this.command('service-publication','service-publication',{packet:this.packet,...b});
      await this.send('service-publication','service-publication',['A','C'],{...b,publication},[this.id('service-plan')]);
    } else if (m.claims.topic === 'service-event' && this.role==='B') {
      const context=this.peer.first('service-publication')!.body;
      const challenge=await this.command('service-challenge-'+b.slot,'service-issue',{packet:this.packet,...context,event:b.event});
      await this.send('service-challenge-'+b.slot,'service-challenge',['A','C'],{slot:b.slot,...context,event:b.event,challenge},[this.id('service-publication')]);
      if(b.slot===0) {
        const attempts:Wire[]=[];
        for(let i=0;i<4;i++) {
          const attempt=await this.command('service-request-0-'+i,'service-request',{packet:this.packet,...context,event:b.event,challenge,timeout_ms:this.config.timeout_ms});attempts.push(attempt);
          await atomic(join(this.config.root,'results/service-attempt.json'),{attempts});
          if(attempt.response&&!attempt.transport_error)break;
        }
        assert(attempts.some(a=>a.response&&!a.transport_error),'WIRE_REAL_SERVICE_REQUEST_FAILED');
      }
    } else if (m.claims.topic === 'service-challenge' && this.role==='A' && b.slot===1) {
      const measurements=await this.command('measurements','resource-observation',{packet:this.packet,host_ref:'host:field-002:'+this.config.surface.surface_id});
      await this.send('measurements','resource-measurements',['C'],{measurements},[this.id('packet')]);
    } else if (m.claims.topic === 'resource-measurements' && this.role==='C') {
      const resources=await this.command('resources','resource-replay',{packet:this.packet,measurements:b.measurements});
      await this.send('resources','resource-bundle',['A','B'],{resources},[this.id('packet')]);
    } else if (m.claims.topic === 'evidence' && this.role==='A') {
      const offer=this.peer.first('offer')!.body;
      const presentation=this.config.door_market ? await (await import('../useful-work-field-003/market.ts')).awaitMarketCrossing(this.peer,offer,b.evidence) :
        await this.command('presentation','present',{offer,evidence:b.evidence});
      await this.send('presentation','presentation',['B'],presentation,[this.id('offer'),m.id]);
    } else if (m.claims.topic === 'evidence' && this.role==='D') {
      const dissent=await this.command('dissent','valuate',{packet:this.packet,evidence:b.evidence});
      await this.send('dissent','dissent',['A','B','C'],dissent,[m.id]);
    } else if (m.claims.topic === 'presentation' && this.role==='B') {
      const observed_at=this.peer.journal.events.find(e=>e.kind==='RECEIVE'&&e.message_id===m.id&&e.detail.first_seen)!.observed_at;
      const exchange=await this.command('acceptance','decide',{...b,observed_at});
      await this.send('acceptance','acceptance',['A','C','D','adapter'],exchange,[this.id('packet'),this.id('offer')]);
    } else if (m.claims.topic === 'acceptance' && this.role==='adapter') {
      const v=await verifyExchange(b); assert(v.report.choice==='ACCEPT','WIRE_LEDGER_ACCEPT_REQUIRED');
      // This adapter's operator configuration permits one local demonstration transfer.
      // The separate Python ledger still interprets only this opaque explicit request.
      const request={entry_ref:'field-entry-1',amount:'12',acceptance_ref:v.bundle.decision.receipt_id,evidence_ref:v.evidence.bundle.evidence_id};
      const requestPath=join(this.config.root,'ledger/request.json'), recordPath=join(this.config.root,'ledger/record.json');
      await atomic(requestPath,request); if (!(await optional(recordPath))) await this.ledger('transfer',[requestPath,recordPath]);
      const external_record=await readJson(recordPath), observation=await this.command('settlement-observation','settlement-observe',{exchange:b,external_record});
      await this.send('ledger-record','ledger-record',['A','B','C','D'],{exchange:b,request,external_record,observation},[m.id]);
    } else if (m.claims.topic === 'ledger-record' && this.role==='C') {
      const settlement=await this.command('settlement','settlement-replay',{exchange:b.exchange,observation:b.observation});
      await this.send('settlement','settlement',['A','B','D'],settlement,[this.id('acceptance')]);
    } else if (m.claims.topic === 'late-offer' && this.role==='A') {
      const evidence=this.peer.first('evidence')!.body.evidence;
      const presentation=await this.command('late-presentation','present',{offer:b,evidence});
      await this.send('late-presentation','late-presentation',['B'],presentation,[m.id,this.id('packet')]);
    } else if (m.claims.topic === 'late-presentation' && this.role==='B') {
      const observed_at=this.peer.journal.events.find(e=>e.kind==='RECEIVE'&&e.message_id===m.id&&e.detail.first_seen)!.observed_at;
      const exchange=await this.command('late-hold','decide',{...b,choice:'HOLD',observed_at,reason:'Evidence reached my local inbox after this separate offer cutoff. Original ACCEPT and ledger entry remain distinct.'});
      const v=await verifyExchange(exchange); assert(!v.report.conditions.within_offerer_observed_window,'WIRE_LATE_EVIDENCE_NOT_LATE');
      await this.send('late-hold','late-hold',['A','C'],exchange,[this.id('late-offer'),this.id('packet')]);
    }
  }
  async progress() {
    if (!this.packet) return;
    if(this.role==='B') await this.progressB();
    if(this.role==='C') for(const purpose of ['audit','service']) {
      const message=this.peer.first(purpose==='audit'?'audit-plan':'service-publication'); if(!message) continue;
      const p=await inspectPlan(message.body.plan);
      for(let slot=0;slot<2;slot++) if(Date.now()>=Date.parse(scheduleSlot(p.policy,slot).scheduled_at)) {
        const event=await this.command(purpose+'-event-'+slot,'randomness',{plan:message.body.plan,slot});
        await this.send(purpose+'-event-'+slot,purpose+'-event',['B'],{slot,event},[message.crossing.crossing_id]);
      }
    }
    if(this.role==='D' && this.peer.first('audit-receipt')) {
      const id=this.id('audit-receipt'), pause=await optional(join(this.config.root,'unavailable-until.json'));
      if(!pause && this.peer.acknowledged(id,'B')) {
        await atomic(join(this.config.root,'unavailable-until.json'),{until:new Date(Date.now()+this.config.unavailable_ms).toISOString()});
        await this.peer.journal.append('UNAVAILABLE',null,{reason:'D local process stops after publishing its diagnostic fault; supervisor will restart this world from its own durable state.'});
        this.peer.stopRequested=true;
      }
    }
    const has=(topic:string)=>Boolean(this.peer.first(topic));
    this.peer.complete=this.role==='adapter'?has('ledger-record'):this.role==='D'?has('dissent')&&has('settlement')&&has('acceptance'):
      has('settlement')&&has('dissent')&&has('late-hold')&&has('acceptance');
  }
  private async progressB() {
    if(!this.peer.first('offer')) {
      const terms=offerTerms(this.packet,this.config.peers,new Date(Date.now()+this.config.run_timeout_ms).toISOString());
      const offer=await this.command('offer','offer',terms);
      await this.send('offer','offer',['A','C','D','adapter'],offer,[this.id('packet')]);
    }
    if(this.config.door_market && !(await optional(join(this.config.root,'market/listing.json')))) {
      const {publishDoor,publishListing}=await import('../../src/useful_work/door_market/model.ts');
      const door=await this.peer.once('market-door',()=>publishDoor(this.peer.first('offer')!.body,this.config.endpoints.B+'/wire',this.config.door_market!.run_id,this.peer.keys,this.config.peers.B.world_id,now()));
      const listing=await publishListing([door],this.config.door_market.run_id,this.peer.keys,this.config.peers.B.world_id,now());
      await atomic(join(this.config.root,'market/listing.json'),listing);
    }
    if(!this.peer.first('legacy-challenge')) {
      const challenge=await this.command('legacy-challenge','legacy-issue',{packet:this.packet});
      await this.send('legacy-challenge','legacy-challenge',['A','C'],{challenge},[this.id('packet')]);
    }
    for(const purpose of ['audit','service']) if(!this.peer.first(purpose+'-plan')) {
      const schedule={starts_at:new Date(Date.now()+this.config.starts_after_ms).toISOString(),cadence_ms:200,rounds:2,issue_window_ms:this.config.issue_window_ms,response_window_ms:this.config.response_window_ms};
      const plan=await this.command(purpose+'-plan','plan',{packet:this.packet,actors:this.config.peers,purpose,schedule});
      const body:Wire={plan}; if(purpose==='audit') body.publication=await this.command('audit-publication','audit-publication',{plan});
      await this.send(purpose+'-plan',purpose+'-plan',purpose==='audit'?['A','C','D']:['A','C'],body,[this.id('packet')]);
    }
    const receipts=this.messages('audit-receipt'), responses=this.messages('audit-response'), issues=this.messages('audit-issue');
    const serviceContext=this.peer.first('service-publication'), serviceChallenges=this.messages('service-challenge'), resources=this.peer.first('resource-bundle');
    const ready=receipts.length===5&&responses.length===2&&issues.length===2&&serviceContext&&serviceChallenges.length===2&&resources&&
      this.messages('legacy-full-receipt').length===2&&this.messages('legacy-sample-receipt').length===2;
    if(ready && !this.peer.first('evidence')) {
      const servicePolicy=(await inspectPlan(serviceContext.body.plan)).policy; if(Date.now()<=Date.parse(servicePolicy.expires_at)) return;
      const auditContext=this.peer.first('audit-plan')!.body, sorted=<T extends Wire>(list:T[])=>[...list].sort((a,b)=>a.body.slot-b.body.slot);
      const history=await this.command('audit-history','audit-history',{job_spec:this.packet.job_spec,work:this.packet.native.work,...auditContext,
        events:sorted(this.messages('audit-event')).map(m=>m.body.event),issues:sorted(issues).map(m=>m.body.issue),responses:sorted(responses).map(m=>m.body.response),
        receipts:sorted(receipts).map(m=>m.body.receipt),observations:[],prior_cuts:[]});
      const audit=await this.peer.once('audit-object',async()=>createAudit(this.packet.job_spec,servicePolicy.result_id,sorted(receipts).map(m=>{
        const response=responses.find(r=>r.body.slot===m.body.slot)!.body, issue=issues.find(i=>i.body.slot===m.body.slot)!.body.issue;
        return {work:this.packet.native.work,challenge:issue.challenge,response:response.response,receipt:m.body.receipt};
      })));
      const attempt=await readJson(join(this.config.root,'results/service-attempt.json'));
      const service_history=await this.command('service-history','service-history',{job_spec:this.packet.job_spec,work:this.packet.native.work,...serviceContext.body,
        events:sorted(this.messages('service-event')).map(m=>m.body.event),challenges:sorted(serviceChallenges).map(m=>m.body.challenge),
        responses:attempt.attempts.filter((a:Wire)=>a.response).map((a:Wire)=>a.response),receipts:attempt.attempts.map((a:Wire)=>a.receipt),prior_cuts:[]});
      const inputEvidence={result_id:servicePolicy.result_id,job_spec:this.packet.job_spec,work:this.packet.native.work,audit,audit_history:history,service_history,resources:resources.body.resources,valuations:[]};
      const valuation=await this.command('valuation','valuate',{packet:this.packet,evidence:inputEvidence});
      const baseline={full_receipts:this.messages('legacy-full-receipt').map(m=>m.body.receipt),sample_receipts:this.messages('legacy-sample-receipt').map(m=>m.body.receipt),
        challenge:this.peer.first('legacy-challenge')!.body.challenge,response:this.peer.first('legacy-response')!.body.response};
      await this.send('evidence','evidence',['A','C','D'],{evidence:{...inputEvidence,valuations:[valuation]},baseline},[this.id('packet'),this.id('offer')]);
    }
    if(this.peer.first('acceptance') && !this.peer.first('late-offer')) {
      const terms=offerTerms(this.packet,this.config.peers,new Date(Date.now()+this.config.late_window_ms).toISOString());
      terms.description='Separate deliberately short offer for the late-evidence probe; no second transfer is authorized.';
      const offer=await this.command('late-offer','offer',terms);
      await this.send('late-offer','late-offer',['A','C'],offer,[this.id('packet')]);
    }
  }
}
