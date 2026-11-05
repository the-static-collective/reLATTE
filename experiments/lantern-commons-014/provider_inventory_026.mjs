/**
 * SPAWN 026 — trusted-host provider inventory adapters.
 * READ ONLY; OAuth/GitHub-App access tokens MUST be supplied by a separately authenticated,
 * consented host. Never call this module from a published static webpage with long-lived keys.
 * The result is a PRIVATE, metadata-only inventory, not a public reLATTE commons entry.
 */
const DRIVE="https://www.googleapis.com/drive/v3/files";
const GITHUB="https://api.github.com";
const PROTOCOL="relatte/deep-glean-inventory/v1";
const LIMIT=5000;
class InventoryError extends Error{constructor(message){super(message);this.name="InventoryError"}}
const err=msg=>{throw new InventoryError(msg)};
const bounded=(v,max=180)=>String(v==null?'':v).trim().slice(0,max);
function authorizedToken(token){
 if(typeof token!=="string"||token.length<12||token.length>4096||/\s/.test(token))err("AUTHORIZED_READ_TOKEN_REQUIRED");
 return token;
}
async function getJSON(url,token,fetcher){
 const response=await fetcher(url,{method:"GET",headers:{authorization:"Bearer "+authorizedToken(token),accept:"application/json"},
  redirect:"error",cache:"no-store"});
 if(response.status!==200)err("PROVIDER_READ_STATUS_"+response.status);
 let data;try{data=await response.json()}catch{err("PROVIDER_INVALID_JSON")}
 if(!data||typeof data!=="object")err("PROVIDER_INVALID_JSON");
 return data;
}
function safeLink(url,provider){
 try{const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password)return "";
  if(provider==="google-drive"&&["drive.google.com","docs.google.com"].includes(u.hostname))return u.href;
  if(provider==="github"&&u.hostname==="github.com")return u.href;
 }catch{}
 return "";
}
function record(provider,id,title,kind,mime,modifiedAt,path,url,summary,visibility="unknown"){
 return {provider,id:bounded(id,250),title:bounded(title,220)||"(untitled)",kind,mime:bounded(mime,160),
  modifiedAt:modifiedAt&&Number.isFinite(Date.parse(modifiedAt))?modifiedAt:"",path:bounded(path,400),
  summary:bounded(summary,500),url:safeLink(url,provider),visibility,level:"metadata"};
}
export async function scanDriveMetadata({token,fetcher=fetch,maxPages=100,maxEntries=LIMIT,grantedScope}){
 authorizedToken(token);
 if(!["drive.metadata.readonly","drive.readonly","drive"].includes(grantedScope))err("BROAD_DRIVE_READ_SCOPE_NOT_ATTESTED");
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>1000||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>LIMIT)err("SCAN_BOUND_INVALID");
 let cursor="",pages=0,incomplete=false,reason="",seen=new Set(),entries=[];
 while(pages<maxPages&&entries.length<maxEntries){
  const params=new URLSearchParams({q:"trashed = false",pageSize:"1000",corpora:"user",
   supportsAllDrives:"true",includeItemsFromAllDrives:"true",spaces:"drive",
   fields:"nextPageToken,incompleteSearch,files(id,name,mimeType,description,modifiedTime,webViewLink,parents,shared)"});
  if(cursor)params.set("pageToken",cursor);
  const data=await getJSON(DRIVE+"?"+params,token,fetcher);
  if(!Array.isArray(data.files))err("DRIVE_PAGE_NOT_FILES_ARRAY");
  pages++;if(data.incompleteSearch===true)incomplete=true;
  for(const file of data.files){
   if(entries.length>=maxEntries)break;
   if(!file||typeof file.id!=="string"||typeof file.name!=="string"||seen.has(file.id))continue;
   seen.add(file.id);
   entries.push(record("google-drive",file.id,file.name,
    file.mimeType==="application/vnd.google-apps.folder"?"folder":"file",
    file.mimeType,file.modifiedTime,"",file.webViewLink,file.description,file.shared?"shared":"unknown"));
  }
  const next=data.nextPageToken;
  if(!next){cursor="";break}
  if(typeof next!=="string"||next.length>4000||next===cursor)err("DRIVE_BROKEN_PAGINATION");
  cursor=next;
 }
 if(cursor)reason="Pagination stopped at configured page/item limit; more provider pages may exist.";
 if(incomplete)reason+=" Provider reported incompleteSearch; some authorized results may be missing.";
 return {entries,coverage:{provider:"google-drive",scope:grantedScope+" (user corpus / OAuth-authorized files only)",
  pages,complete:!cursor&&!incomplete,reason:reason.trim()}};
}
