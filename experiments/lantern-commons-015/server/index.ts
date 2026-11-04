// @ts-nocheck
/**
 * LANTERN 015 — source-owned JAR;VIS real connected front door.
 * Public and read-only. No DB credentials, no private data, no arbitrary
 * GitHub paths, no GitHub writes, no invisible task execution.
 * Deployed on existing Supabase Edge function, not Vercel.
 */
import {propose,validateCartridge} from './live-offer-router.mjs';
import CARTRIDGE from './live-offer-001.json' with { type:'json' };
import {PAGE} from './page.ts';

const PATH='/functions/v1/jarvis-solo-live-017';
const SOURCES=Object.freeze({
 jarvis:{repo:'JAR-VIS',ref:'main',path:'package.json',label:'JAR;VIS local executable scripts'},
 world:{repo:'reLATTE',ref:'experiment/lantern-commons-014-solo-desk',path:'world-cartridges/lantern-commons-012.lock.json',label:'reLATTE verified world-cartridge lineage'},
 ghot:{repo:'GHoT',ref:'main',path:'README.md',label:'GHoT distributed work runtime documentation'},
 static_os:{repo:'static-os',ref:'main',path:'README.md',label:'STATIC OS bootstrap status'}
});
const SOURCE_KEYS=Object.keys(SOURCES);
const CACHE=new Map();
const MAX_BODY=750;
const BASE={
 'cache-control':'no-store',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
 'x-frame-options':'DENY',
 'permissions-policy':'camera=(), microphone=(self), geolocation=()',
 'cross-origin-resource-policy':'same-origin',
 'vary':'origin'
};
const json=(value,status=200)=>Response.json(value,{status,headers:BASE});
const SAFE_PLAN_CARTRIDGE=validateCartridge(CARTRIDGE);

function route(req){
 const p=new URL(req.url).pathname;
 if(p===PATH || p===PATH+'/' || p==='/')return 'page';
 if(p.endsWith('/health'))return 'health';
 if(p.endsWith('/capabilities'))return 'capabilities';
 if(p.endsWith('/execute'))return 'execute';
 return 'not_found';
}
function publicEndpoint(req){
 const origin=req.headers.get('origin');
 if(origin && origin!=='null' && origin!==new URL(req.url).origin)return false;
 return true;
}
async function gitFile(key){
 if(!SOURCE_KEYS.includes(key))throw Error('UNRECOGNIZED_SOURCE');
 const cached=CACHE.get(key);
 if(cached && Date.now()-cached.at<60000)return cached.value;
 const x=SOURCES[key];
 const url='https://api.github.com/repos/the-static-collective/'+
   encodeURIComponent(x.repo)+'/contents/'+x.path.split('/').map(encodeURIComponent).join('/')+
   '?ref='+encodeURIComponent(x.ref);
 const response=await fetch(url,{headers:{
    'accept':'application/vnd.github+json',
    'user-agent':'the-static-collective-jarvis-solo-readonly-017',
    'x-github-api-version':'2022-11-28'
  },signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('GITHUB_HTTP_'+response.status);
 const info=await response.json();
 if(info.type!=='file'||typeof info.content!=='string'||
   info.size>50000||!/^[0-9a-f]{40}$/.test(info.sha))
   throw Error('UNREVIEWED_SOURCE_SHAPE');
 const raw=Uint8Array.from(atob(info.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
 const content=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 if(content.length>55000)throw Error('SOURCE_TOO_LARGE');
 const value={
   key,label:x.label,repo:'the-static-collective/'+x.repo,
   ref:x.ref,path:x.path,source_sha:info.sha,
   source_url:info.html_url||'https://github.com/the-static-collective/'+x.repo+'/blob/'+encodeURIComponent(x.ref)+'/'+x.path,
   fetched_at:new Date().toISOString(),content
 };
 CACHE.set(key,{at:Date.now(),value});
 return value;
}
function compileReport(found){
 const h={source:found.repo,ref:found.ref,path:found.path,
  github_source_blob_sha:found.source_sha,source_url:found.source_url,
  fetched_at:found.fetched_at,operator:'JAR;VIS live read-only source inspector',
  external_writes:0};
 if(found.key==='jarvis'){
  const p=JSON.parse(found.content);
  if(!p.scripts || typeof p.scripts!=='object')throw Error('SOURCE_NOT_A_PACKAGE');
  return {...h,kind:'REAL_JARVIS_PACKAGE_SCRIPTS',scripts:p.scripts,
   node_engine:p.engines?.node??'unspecified',
   execution_status:'SCRIPTS_DISCOVERED_NOT_EXECUTED',
   note:'These scripts exist in the public JAR;VIS repository. Running them needs a separate authorized local runtime.'};
 }
 if(found.key==='world'){
  const p=JSON.parse(found.content);
  if(!Array.isArray(p.worlds)||!p.parent)throw Error('WORLD_LOCK_NOT_VALID');
  return {...h,kind:'VERIFIED_WORLD_CARTRIDGE_LOCK',
   source_run:p.verified_workflow_run,game_version:p.game_version,
   parent:p.parent,
   children:p.worlds.map(w=>({branch:w.branch,version:w.version,
      cartridge_id:w.cartridge_id,parent_cartridge_id:w.parent_cartridge_id,
      archived_artifact:w.archive})),
   note:'This is a real GitHub source lock of earlier Minecraft game evidence, not a new game run or a reLATTE admission.'};
 }
 const lines=found.content.split(/\r?\n/);
 return {...h,kind:found.key==='ghot'?'GHOT_DOCUMENTED_RUNTIME':'STATIC_OS_DOCUMENTED_STATUS',
   title:lines.find(l=>/^# /.test(l))??'(no title)',
   excerpts:lines.filter(l=>/^(##? |\*\*Status:|> )/.test(l)).slice(0,16).map(s=>s.slice(0,280)),
   status:found.key==='static_os'?'BOOTSTRAP_UNDER_REVIEW_NOT_VERIFIED_INSTALLED':
     'DOCUMENTATION_DISCOVERED_NOT_EXECUTED',
   note:'Source-owned public documentation was read and summarized. No remote code or GHoT job was started.'};
}
async function capabilities(){
 const rows=await Promise.all(SOURCE_KEYS.map(async key=>{
   try{
     const a=await gitFile(key);
     return {id:key,label:a.label,state:'CONNECTED_READ_ONLY',source_sha:a.source_sha,
       repo:a.repo,ref:a.ref,path:a.path,source_url:a.source_url,
       execution:'DOWNLOAD_SOURCE_BACKED_REPORT'};
   }catch(e){
     const message=typeof e?.message==='string'?e.message:'SOURCE_UNAVAILABLE';
     return {id:key,label:SOURCES[key].label,state:'UNAVAILABLE',reason:message};
   }
 }));
 return {ok:true,schema:'jarvis.connected-capability-registry/v1',
   source:'ACTUAL_PUBLIC_GITHUB_FILES',project:'LANTERN-015',
   connected:rows,remote_execution_available:true,
   remote_authority:'READ_ONLY_PUBLIC_GITHUB_INSPECTION',
   source_owned_planner:{id:CARTRIDGE.id,authority:CARTRIDGE.authority,
     remote_execution:CARTRIDGE.remote_execution,
     validator_ran:SAFE_PLAN_CARTRIDGE},
   no_background_jobs:true,no_github_writes:true,
   local_actions:['checklist','csv','html-work-card','audit','record-audio-with-device-permission'],
   privacy:'No local notes read or submitted. Only an explicit short offer submitted to POST /execute will cross this boundary.'};
}
async function input(req){
 if(!(req.headers.get('content-type')||'').startsWith('application/json'))return null;
 const n=Number(req.headers.get('content-length')||0);
 if(n>MAX_BODY)return null;
 const raw=await req.text();
 if(new TextEncoder().encode(raw).length>MAX_BODY)return null;
 try{
  const p=JSON.parse(raw);
  return p && typeof p==='object' && !Array.isArray(p) ? p : null;
 }catch{return null;}
}
Deno.serve(async req=>{
 try{
   const r=route(req);
   if(req.method==='GET'&&r==='page')return new Response(PAGE,{
     headers:{...BASE,'content-type':'text/html; charset=utf-8',
     'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data: blob:; media-src blob:; form-action 'none'; frame-ancestors 'none'",
     'x-robots-tag':'noindex,nofollow'}});
   if(req.method==='GET'&&r==='health')return json({ok:true,
      schema:'jarvis.connected-frontdoor-health/v1',model:'NO_AI',
      github:'PUBLIC_READ_ONLY',operator_effects:0,
      private_data_collected:0,planner:CARTRIDGE.id});
   if(req.method==='GET'&&r==='capabilities')return json(await capabilities());
   if(req.method==='POST'&&r==='execute'){
     if(!publicEndpoint(req))return json({ok:false,reason:'CROSS_ORIGIN_POST_REFUSED'},403);
     const b=await input(req);
     if(!b||typeof b.action!=='string')return json({ok:false,reason:'INVALID_BODY'},400);
     if(b.action==='source_report'){
       if(typeof b.source!=='string'||!SOURCE_KEYS.includes(b.source))
         return json({ok:false,reason:'UNSUPPORTED_SOURCE'},422);
       try{
        const found=await gitFile(b.source);
        return json({ok:true,schema:'jarvis.connected-execution-receipt/v1',
         performed:'REMOTE_GITHUB_SOURCE_FETCH_AND_COMPILE',
         authority:'PUBLIC_READ_ONLY',report:compileReport(found),writes:0});
       }catch(e){return json({ok:false,reason:'SOURCE_UNAVAILABLE',detail:String(e?.message||'')},503);}
     }
     if(b.action==='route_offer'){
       if(typeof b.offer!=='string'||b.offer.length<4||b.offer.length>240||
         /[\u0000-\u001f]/.test(b.offer))
         return json({ok:false,reason:'OFFER_TEXT_REQUIRED_4_TO_240'},422);
       const plan=propose(b.offer,CARTRIDGE);
       return json({ok:true,schema:'jarvis.remote-live-offer-receipt/v1',
         performed:'SOURCE_OWNED_LIVE_OFFER_ROUTER_EVALUATED',
         operator_action_approved_by_click:true,
         action_executed_on_person_or_device:false,
         source_router_sha:'92835c17c2cfba84d1e67acca03338af1d91ff1a',
         source_cartridge_sha:'bf04098596d469f0e8a6bd7fa7fc81205f6ab9c2',
         plan:{...plan,actions:plan.actions.slice(0,5).map(({rank,...x})=>x)},
         writes:0,inputs_retained:false,
         notice:'The router produced a proposal only; this did NOT perform a recording, upload, announcement or human commitment.'});
     }
     return json({ok:false,reason:'ACTION_NOT_ALLOWED'},422);
   }
   return json({ok:false,reason:r==='not_found'?'NOT_FOUND':'METHOD_NOT_ALLOWED'},r==='not_found'?404:405);
 }catch(e){
  return json({ok:false,reason:'SAFE_FAILURE',detail:String(e?.message||'INTERNAL_ERROR').slice(0,90)},503);
 }
});
