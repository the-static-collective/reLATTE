/**
 * SPDX-License-Identifier: MIT
 * SPAWN 025 — provider capability adapters.
 *
 * This module is executable when invoked by a separately authorized host with a narrowly
 * scoped, short-lived provider OAuth access token. It DOES NOT perform OAuth, store a token,
 * transmit credentials to a browser, or grant access by virtue of a reLATTE signed packet.
 *
 * Provider consent: Google Drive per-file drive.file; GitHub App selected repository
 * Contents:read/write. Never use a blanket GitHub OAuth repo scope as the default.
 * All mutating operations are CREATE_NEW_ONLY with explicit, fresh approval.
 */
const SCHEMA="relatte/provider-create-intent/v1";
const mimeMap={html:"text/html",md:"text/markdown",csv:"text/csv",json:"application/json",txt:"text/plain"};
const denyPaths=/^(?:\.github(?:\/|$)|\.env(?:\.|$)|\.git(?:\/|$))|(?:^|\/)[^/]*\.(?:pem|key|secret)$/i;
const safeChars=/^[a-zA-Z0-9._-]+$/;
export class BridgeFailure extends Error {
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
const refuse=(code,status=400)=>{throw new BridgeFailure(code,status)};
const codec=new TextEncoder();
const SHA=/^[a-f0-9]{64}$/;
const safeDestination=(provider,target,ext)=>{
 if(provider==="google-drive"){
  const filename=target?.filename;
  if(typeof filename!=="string"||filename.length>120||!/^[-a-z0-9_ ().]+\.(?:html|md|csv|json|txt)$/i.test(filename)||filename.split(".").at(-1).toLowerCase()!==ext)refuse("DRIVE_SAFE_FILENAME_REQUIRED");
  return {filename};
 }
 if(provider==="github"){
  const {owner,repo,path,expectedExistingSha}=target||{};
  if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)||typeof path!=="string"||path.length>120||
    path.split("/").some(s=>!safeChars.test(s)||s==="."||s==="..")||denyPaths.test(path)||
    path.split(".").at(-1).toLowerCase()!==ext||expectedExistingSha!==null)refuse("GITHUB_CREATE_ONLY_PATH_REQUIRED");
  return {owner,repo,path};
 }
 refuse("UNKNOWN_PROVIDER");
};
function cleanToken(token){
 if(typeof token!=="string"||token.length<12||token.length>4096||/[\r\n\s]/.test(token))refuse("FRESH_OAUTH_TOKEN_REQUIRED",401);
 return token;
}
export async function sha256(content){
 const c=globalThis.crypto;
 if(!c?.subtle)refuse("WEB_CRYPTO_REQUIRED",503);
 return [...new Uint8Array(await c.subtle.digest("SHA-256",codec.encode(content)))].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function validateCreateIntent(intent){
 if(!intent||intent.schema!==SCHEMA||intent.version!==1||intent.action!=="CREATE_NEW_ONLY"||
   !["google-drive","github"].includes(intent.provider)||!intent.controls||!intent.artifact)refuse("INVALID_INTENT");
 const {artifact,controls}=intent;
 const name=artifact.name;
 if(typeof name!=="string"||name.length>180||typeof artifact.body!=="string"||artifact.body.length<1||artifact.body.length>30000||
   typeof artifact.bytes!=="number"||artifact.bytes!==codec.encode(artifact.body).length||!SHA.test(artifact.sha256)||typeof artifact.mime!=="string")refuse("INVALID_ARTIFACT");
 const ext=name.split(".").at(-1).toLowerCase();
 if(!Object.hasOwn(mimeMap,ext)||artifact.mime.split(";")[0]!==mimeMap[ext])refuse("ARTIFACT_FORMAT_MISMATCH");
 if(await sha256(artifact.body)!==artifact.sha256)refuse("ARTIFACT_DIGEST_MISMATCH");
 if(controls.requiresProviderOAuth!==true||controls.requiresExplicitPerActionApproval!==true||controls.requiresWriteVerification!==true||
   controls.credentialIncluded!==false||controls.overwriteAllowed!==false)refuse("PERMISSION_GATES_REQUIRED");
 const target=safeDestination(intent.provider,intent.target,ext);
 return {target,format:ext,hash:artifact.sha256,bytes:artifact.bytes,provider:intent.provider,body:artifact.body,mime:mimeMap[ext]};
}
function authHeaders(token){return {authorization:"Bearer "+cleanToken(token)}}
async function parseOrFail(response,expected,provider){
 if(!expected.includes(response.status))refuse("PROVIDER_"+provider+"_HTTP_"+response.status,response.status||503);
 let data;try{data=await response.json()}catch{refuse("PROVIDER_RESPONSE_NOT_JSON",502)}
 if(!data||typeof data!=="object")refuse("PROVIDER_RESPONSE_INVALID",502);
 return data;
}
function toBase64(str){
 const data=codec.encode(str);let result="";
 for(let i=0;i<data.length;i+=1000)result+=String.fromCharCode(...data.subarray(i,i+1000));
 return btoa(result);
}
function fromBase64(str){
 const binary=atob(str.replace(/\s+/g,""));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return new TextDecoder().decode(bytes);
}
function urlPath(path){return path.split("/").map(encodeURIComponent).join("/")}
export async function createApprovedProviderFile({intent,token,approved=false,fetcher=fetch}){
 const plan=await validateCreateIntent(intent);
 if(approved!==true)refuse("FRESH_WRITE_APPROVAL_REQUIRED",403);
 const headers=authHeaders(token);
 if(typeof fetcher!=="function")refuse("FETCH_ADAPTER_REQUIRED");
 let remote,verifiedBytes;
 if(plan.provider==="google-drive"){
  // drive.file only allows application-created/individually selected files.
  // Multipart metadata + raw content uploads a file without touching other Drive files.
  const boundary="relatte025"+globalThis.crypto.randomUUID().replace(/-/g,"");
  const metadata={name:plan.target.filename,mimeType:plan.mime};
  const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
    JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: "+plan.mime+"; charset=UTF-8\r\n\r\n"+
    plan.body+"\r\n--"+boundary+"--";
  const res=await fetcher("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",{
    method:"POST",headers:{...headers,"content-type":"multipart/related; boundary="+boundary},body,redirect:"error"});
  remote=await parseOrFail(res,[200,201],"DRIVE");
  if(typeof remote.id!=="string"||remote.id.length>180)refuse("DRIVE_CREATE_RESULT_UNVERIFIED",502);
  // Require readback of actual provider bytes; API success alone is not a verified write.
  const read=await fetcher("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(remote.id)+"?alt=media",{
    method:"GET",headers,redirect:"error"});
  if(read.status!==200)refuse("DRIVE_READBACK_FAILED",502);
  verifiedBytes=await read.text();
 }else{
  const {owner,repo,path}=plan.target;
  const u="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/contents/"+urlPath(path);
  // No SHA is supplied; GitHub's contents API refuses overwrites for existing files.
  const res=await fetcher(u,{method:"PUT",headers:{...headers,"content-type":"application/json","accept":"application/vnd.github+json",
    "x-github-api-version":"2022-11-28"},body:JSON.stringify({message:"create: "+path+" via reviewed reLATTE 025 intent",content:toBase64(plan.body)}),redirect:"error"});
  remote=await parseOrFail(res,[201],"GITHUB");
  if(!remote.content?.sha||!remote.content?.html_url)refuse("GITHUB_CREATE_RESULT_UNVERIFIED",502);
  const read=await fetcher(u,{method:"GET",headers:{...headers,accept:"application/vnd.github+json",
    "x-github-api-version":"2022-11-28"},redirect:"error"});
  const data=await parseOrFail(read,[200],"GITHUB_READBACK");
  if(data.encoding!=="base64"||typeof data.content!=="string")refuse("GITHUB_READBACK_NOT_BASE64",502);
  verifiedBytes=fromBase64(data.content);
 }
 const observedDigest=await sha256(verifiedBytes);
 if(observedDigest!==plan.hash)refuse("WRITE_READBACK_DIGEST_MISMATCH",409);
 const url=plan.provider==="google-drive"?remote.webViewLink:remote.content.html_url;
 if(typeof url!=="string"||!url.startsWith("https://"))refuse("PROVIDER_LINK_NOT_RETURNED",502);
 return {schema:"relatte/provider-write-receipt/v1",provider:plan.provider,action:"CREATE_NEW_ONLY",
  status:"PROVIDER_READBACK_VERIFIED",expectedSha256:plan.hash,readbackSha256:observedDigest,
  remoteUrl:url,remoteId:plan.provider==="google-drive"?remote.id:remote.content.sha,
  note:"Actual provider file bytes were fetched again and matched. Physical outcomes and sharing permissions are not asserted."};
}
export async function listAccessibleFiles({provider,token,repository,fetcher=fetch}){
 const headers=authHeaders(token);
 if(provider==="google-drive"){
  const u="https://www.googleapis.com/drive/v3/files?fields=nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)&pageSize=20&q="+encodeURIComponent("trashed = false");
  const res=await fetcher(u,{method:"GET",headers,redirect:"error"});
  const data=await parseOrFail(res,[200],"DRIVE_LIST");
  return {provider,files:Array.isArray(data.files)?data.files.slice(0,20):[],boundary:"Only files authorized under drive.file, not an unrestricted Drive crawl."};
 }
 if(provider==="github"){
  if(typeof repository!=="string"||!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository))refuse("SELECT_ONE_GITHUB_REPOSITORY");
  const [owner,name]=repository.split("/");
  const u="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(name)+"/contents";
  const res=await fetcher(u,{method:"GET",headers:{...headers,accept:"application/vnd.github+json"},redirect:"error"});
  const data=await parseOrFail(res,[200],"GITHUB_LIST");
  return {provider,files:Array.isArray(data)?data.filter(x=>x&&x.type==="file").slice(0,20):[],
   boundary:"One explicitly selected repository, not all organizations or hidden credentials."};
 }
 refuse("UNKNOWN_PROVIDER");
}
