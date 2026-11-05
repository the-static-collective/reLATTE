import {PAGE} from "./page.ts";
const ROOT="/functions/v1/relatte-app-026";
const HEAD={"cache-control":"no-store, max-age=0","referrer-policy":"no-referrer",
 "x-content-type-options":"nosniff","x-frame-options":"DENY","x-robots-tag":"noindex,nofollow"};
Deno.serve(req=>{
 const u=new URL(req.url),p=u.pathname.replace(/\/$/,"");
 const root=p===ROOT||p==="/relatte-app-026",download=p===ROOT+"/download"||p==="/relatte-app-026/download";
 if(!root&&!download)return Response.json({error:"NOT_FOUND"},{status:404,headers:HEAD});
 if(req.method!=="GET"&&req.method!=="HEAD")return Response.json({error:"READ_ONLY"},{status:405,headers:{...HEAD,allow:"GET,HEAD"}});
 if(root&&u.searchParams.get("health")==="1")return Response.json({ok:true,version:26,delivery:"OFFLINE_HTML_ATTACHMENT",
  privateInventoryStored:false,providerOAuthConfigured:false,serverInventoryWrites:0,metadataLevel:"SOURCE_LEADS_NOT_CONTENT_PROOF"},{headers:HEAD});
 if(root)return Response.json({schema:"relatte/deep-glean-app/v1",version:26,status:"DOWNLOAD_ONLY_NOT_HOSTED_HTML",
  download:ROOT+"/download",notice:"Download and open locally. Authorized provider inventory must be supplied separately; no OAuth credentials are carried."},{headers:HEAD});
 return new Response(req.method==="HEAD"?null:PAGE,{status:200,headers:{...HEAD,
  "content-type":"application/octet-stream",
  "content-disposition":'attachment; filename="SPAWN_026_Deep_Glean.html"',
  "content-security-policy":"default-src 'none'; sandbox"
 }});
});