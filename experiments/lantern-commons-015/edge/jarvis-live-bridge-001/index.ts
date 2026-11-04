/** JAR;VIS LIVE BRIDGE 001: public, read-only, allowlisted GitHub evidence. 
 * No user notes, private data, credentials, external writes or remote execution.
 */
const VERSION="jarvis-live-bridge-001.0.0";
const TARGETS={
  jarvis:{repo:"JAR-VIS",doc:"README.md",description:"Local attendant: now-first offers, proposals, bounded source inspection",scope:"read-only source; not remote agent execution"},
  relatte:{repo:"reLATTE",doc:"README.md",description:"World cartridges, tests, attributable crossings",scope:"read-only source; not human admission"},
  ghot:{repo:"GHoT",doc:"README.md",description:"Distributed compute experiments",scope:"read-only source; not remote machine control"},
  planz:{repo:"planZ",doc:"README.md",description:"Planning archaeology and follow-through experiments",scope:"read-only source; not a connected planner"}
};
const OFFERS=[
 {id:"inspect_public_source",execution:"CONNECTED_NOW",effect:"FETCH_PUBLIC_PROJECT_README",claim:"Actual live public source, byte digest and URL; no private work sent"},
 {id:"check_public_ci",execution:"CONNECTED_NOW",effect:"FETCH_PUBLIC_GITHUB_ACTIONS",claim:"Live public build status and workflow URLs; no workflow dispatched"}
];
const HEADERS={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400","cache-control":"no-store","x-content-type-options":"nosniff"};
const j=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:HEADERS});
async function upstream(url,accept){
 const r=await fetch(url,{method:"GET",headers:{accept,"user-agent":"JARVIS-Live-Bridge-001-ReadOnly"},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error("UPSTREAM_"+r.status);
 if(Number(r.headers.get("content-length")||0)>300000)throw new Error("UPSTREAM_TOO_LARGE");
 return r;
}
async function sha256(str){
 const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
 return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
 if(req.method==="GET")return j({schema:VERSION,ok:true,mode:"PUBLIC_READ_ONLY",targets:TARGETS,offers:OFFERS,writes_enabled:false,remote_agent_execution:false,user_work_received:false});
 if(req.method!=="POST")return j({schema:VERSION,ok:false,code:"METHOD_NOT_ALLOWED"},405);
 if(Number(req.headers.get("content-length")||0)>512||!req.headers.get("content-type")?.includes("application/json"))return j({schema:VERSION,ok:false,code:"SMALL_JSON_ONLY"},400);
 let body;
 try{const input=await req.text();if(input.length>512)return j({schema:VERSION,ok:false,code:"BODY_TOO_LARGE"},413);body=JSON.parse(input)}
 catch{return j({schema:VERSION,ok:false,code:"INVALID_JSON"},400)}
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).sort().join(",")!=="action,target")return j({schema:VERSION,ok:false,code:"ONLY_ACTION_AND_TARGET_ALLOWED"},400);
 if(typeof body.target!=="string"||!Object.prototype.hasOwnProperty.call(TARGETS,body.target)||!["inspect","ci"].includes(body.action))return j({schema:VERSION,ok:false,code:"NO_SUCH_APPROVED_PUBLIC_ACTION"},400);
 const target=body.target, config=TARGETS[target],repo=config.repo,readAt=new Date().toISOString();
 try{
  if(body.action==="inspect"){
   const source="https://raw.githubusercontent.com/the-static-collective/"+repo+"/main/"+config.doc;
   const r=await upstream(source,"text/plain");
   const full=await r.text();if(full.length>120000)throw new Error("SOURCE_TOO_LARGE");
   return j({schema:VERSION,ok:true,action:"inspect",target,repository:"the-static-collective/"+repo,source_url:source,observed_at:readAt,sha256:await sha256(full),source_bytes:new TextEncoder().encode(full).length,excerpt:full.slice(0,1800),claim:config.scope,writes_performed:0,user_work_received:false});
  }
  const source="https://api.github.com/repos/the-static-collective/"+repo+"/actions/runs?per_page=5";
  const r=await upstream(source,"application/vnd.github+json");
  const data=await r.json();
  const runs=Array.isArray(data.workflow_runs)?data.workflow_runs.slice(0,5).map(x=>({
   id:String(x.id||""),name:String(x.name||"").slice(0,140),status:String(x.status||"unknown"),conclusion:typeof x.conclusion==="string"?x.conclusion:null,created_at:String(x.created_at||""),url:String(x.html_url||"")
  })):[];
  return j({schema:VERSION,ok:true,action:"ci",target,repository:"the-static-collective/"+repo,source_url:source,observed_at:readAt,run_count:runs.length,runs,claim:"Public Actions evidence only, not a human-work outcome.",writes_performed:0,user_work_received:false});
 }catch(e){
  const detail=e instanceof Error?e.message:"UPSTREAM_UNAVAILABLE";
  console.warn("PUBLIC_READ_FAILED",body.action,target,detail);
  return j({schema:VERSION,ok:false,code:"PUBLIC_SOURCE_UNAVAILABLE",detail:detail.slice(0,60),action:body.action,target,writes_performed:0,user_work_received:false},503);
 }
});
