import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDriveMetadata,scanGithubInstallation,mergePrivateInventories} from './provider_inventory_026.mjs';

const access='example-authorized-reader';
const json=data=>({status:200,json:async()=>data});
test('Drive metadata scanner reads all returned pages, records exact coverage',async()=>{
 let pages=0;
 const fetcher=async(url,opts)=>{
  pages++;
  assert.equal(opts.method,'GET');
  assert.match(url,/drive\/v3\/files\?/);
  return json(pages===1?{files:[{id:'a1',name:'Event Plan',mimeType:'application/vnd.google-apps.document',
    webViewLink:'https://docs.google.com/document/d/a1/edit'}],nextPageToken:'next'}:
   {files:[{id:'a2',name:'Garden Plan',mimeType:'application/pdf'}]});
 };
 const r=await scanDriveMetadata({token:access,grantedScope:'drive.metadata.readonly',fetcher});
 assert.equal(r.entries.length,2);
 assert.equal(r.coverage.pages,2);
 assert.equal(r.coverage.complete,true);
 assert.equal(r.entries[0].level,'metadata');
});
test('Drive scanner marks partial searches and refuses unverified broad scopes',async()=>{
 await assert.rejects(scanDriveMetadata({token:access,grantedScope:'drive.file'}),/BROAD_DRIVE_READ_SCOPE_NOT_ATTESTED/);
 const r=await scanDriveMetadata({token:access,grantedScope:'drive.readonly',maxPages:1,
  fetcher:async()=>json({files:[{id:'a1',name:'One File'}],nextPageToken:'cursor',incompleteSearch:true})});
 assert.equal(r.coverage.complete,false);
 assert.match(r.coverage.reason,/incompleteSearch/);
});

test('GitHub App installation scanner enumerates authorized public and private repositories',async()=>{
 let calls=0;
 const fetcher=async url=>{
  calls++;assert.match(url,/installation\/repositories/);
  if(calls===1)return json({total_count:2,repositories:[
   {full_name:'org/fellowship',name:'fellowship',private:false,description:'Events',default_branch:'main'},
   {full_name:'org/garden',name:'garden',private:true,description:'Grower work',default_branch:'main'}]});
  throw Error('Unexpected additional page');
 };
 const r=await scanGithubInstallation({token:access,fetcher});
 assert.equal(r.coverage.complete,true);assert.equal(r.entries.length,2);
 assert.equal(r.entries[1].visibility,'private');assert.equal(calls,1);
});
test('GitHub selected tree scan warns on truncation and omits obvious secret paths',async()=>{
 const fetcher=async url=>url.includes('installation/repositories')?
 json({total_count:1,repositories:[{full_name:'org/garden',name:'garden',private:false,default_branch:'main'}]}):
 json({truncated:true,tree:[{path:'README.md',type:'blob'},{path:'.env',type:'blob'},
 {path:'src/plan.md',type:'blob'},{path:'secret.key',type:'blob'}]});
 const r=await scanGithubInstallation({token:access,fetcher,includeTrees:true,selectedRepositories:['org/garden']});
 assert.equal(r.coverage.complete,false);
 assert.match(r.coverage.reason,/truncated/);
 assert.equal(r.entries.length,3);
 assert.ok(r.entries.every(e=>!e.id.includes('.env')&&!e.id.includes('.key')));
});
test('Private index merge is schema-bounded and deduplicates identical source references',()=>{
 const item={provider:'github',id:'org/test',title:'test',url:'',kind:'repository',mime:'metadata',
  modifiedAt:'',path:'org/test',summary:'',level:'metadata',visibility:'public'};
 const scan={entries:[item],coverage:{provider:'github',scope:'app',pages:1,complete:true,reason:''}};
 const merged=mergePrivateInventories(scan,scan);
 assert.equal(merged.entries.length,1);assert.equal(merged.coverage.length,2);
 assert.equal(merged.schema,'relatte/deep-glean-inventory/v1');
});
