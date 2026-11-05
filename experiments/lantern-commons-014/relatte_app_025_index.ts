import {PAGE} from "./page.ts";
const ROOT="/functions/v1/relatte-app-025";
const ALIAS="/relatte-app-025";
const H={
 "cache-control":"no-store, max-age=0",
 "referrer-policy":"no-referrer",
 "x-content-type-options":"nosniff",
 "x-frame-options":"DENY",
 "x-robots-tag":"noindex,nofollow",
 "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=()"
};
Deno.serve(req=>{
 const u=new URL(req.url),p=u.pathname.replace(/\/$/,"");
 const manifest=p===ROOT||p===ALIAS,download=p===ROOT+"/download"||p===ALIAS+"/download";
 if(!manifest&&!download)return Response.json({error:"NOT_FOUND"},{status:404,headers:H});
 if(req.method!=="GET"&&req.method!=="HEAD")return Response.json({error:"READ_ONLY"},{status:405,headers:{...H,allow:"GET,HEAD"}});
 if(manifest&&u.searchParams.get("health")==="1")return Response.json({ok:true,version:25,delivery:"HTML_ATTACHMENT_ONLY",
  externalOAuthConfigured:false,providerTokenHandling:"NONE_IN_DOWNLOADED_APP",networkWrites:0,
  artifactExecutor:true,providerIntents:"CREATE_NEW_ONLY",physicalOutcomeVerified:false},{headers:H});
 if(manifest)return Response.json({schema:"relatte-app-025/v1",status:"DOWNLOAD_ONLY_NOT_HOSTED_HTML",
   download:ROOT+"/download",notice:"Opens locally as a standalone application. Provider login requires separately configured HTTPS OAuth infrastructure."},{headers:H});
 return new Response(req.method==="HEAD"?null:PAGE,{status:200,headers:{
 ...H,"content-type":"application/octet-stream",
 "content-disposition":'attachment; filename="SPAWN_025_Solo_Connector_Workbench.html"',
 "content-security-policy":"default-src 'none'; sandbox"
 }});
});