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
