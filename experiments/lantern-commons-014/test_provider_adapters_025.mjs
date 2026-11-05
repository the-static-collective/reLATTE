import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {BridgeFailure,sha256,validateCreateIntent,createApprovedProviderFile,listAccessibleFiles} from './provider_adapters_025.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base={
 schema:'relatte/provider-create-intent/v1',version:1,action:'CREATE_NEW_ONLY',
 provider:'google-drive',target:{filename:'real-work.md',folder:'user-selected app-accessible location only'},
 artifact:{name:'real-work.md',mime:'text/markdown;charset=utf-8',body:'# Work done\n\nThis file was built by the local solo executor.\n',bytes:0,sha256:''},
 controls:{requiresProviderOAuth:true,requiresExplicitPerActionApproval:true,requiresWriteVerification:true,credentialIncluded:false,overwriteAllowed:false,scope:'drive.file per-file access'},
 caveat:'PREPARED REQUEST ONLY; no account has been connected and nothing has been saved remotely.'
};
const make=async()=>{const a=JSON.parse(JSON.stringify(base));a.artifact.bytes=new TextEncoder().encode(a.artifact.body).length;a.artifact.sha256=await sha256(a.artifact.body);return a;};
const fake=(status,data)=>({status,json:async()=>data,text:async()=>typeof data==='string'?data:JSON.stringify(data)});

test('Drive create-only adapter actually builds multipart body and independently reads back matching content',async()=>{
 const intent=await make(),calls=[];
 const request=async(url,opts)=>{
  calls.push({url,opts});
  assert.match(opts.headers.authorization,/^Bearer /);
  if(opts.method==='POST')return fake(200,{id:'observed-google-file-id',name:'real-work.md',mimeType:'text/markdown',webViewLink:'https://drive.google.com/file/d/observed-file-id/view'});
  assert.match(url,/observed-google-file-id\?alt=media/);
  return fake(200,intent.artifact.body);
 };
 const res=await createApprovedProviderFile({intent,token:'oauth-token-example-123456',approved:true,fetcher:request});
 assert.equal(res.status,'PROVIDER_READBACK_VERIFIED');
 assert.equal(res.remoteUrl,'https://drive.google.com/file/d/observed-file-id/view');
 assert.equal(res.readbackSha256,intent.artifact.sha256);
 assert.equal(calls.length,2);
 assert.equal(calls[0].opts.method,'POST');
 assert.match(calls[0].url,/googleapis.com\/upload\/drive\/v3\/files\?uploadType=multipart/);
 assert.match(calls[0].opts.body,/# Work done/);
 assert.doesNotMatch(JSON.stringify(res),/oauth-token-example/);
});

test('provider changes are refused until a person freshly approves exact bytes and OAuth token exists',async()=>{
 const intent=await make();let called=0;
 const fetcher=()=>{called++;return fake(201,{})};
 await assert.rejects(createApprovedProviderFile({intent,approved:false,token:'oauth-token-example-123456',fetcher}),/FRESH_WRITE_APPROVAL_REQUIRED/);
 await assert.rejects(createApprovedProviderFile({intent,approved:true,token:'',fetcher}),/FRESH_OAUTH_TOKEN_REQUIRED/);
 assert.equal(called,0);
});

test('provider adapter rejects tampered work product, impossible MIME and overwrite request before sending API calls',async()=>{
 const intent=await make();let calls=0;const fetcher=()=>{calls++;return fake(200,{})};
 const tampered=JSON.parse(JSON.stringify(intent));tampered.artifact.body+='corrupt';
 await assert.rejects(validateCreateIntent(tampered),/INVALID_ARTIFACT|ARTIFACT_DIGEST_MISMATCH/);
 const badMime=JSON.parse(JSON.stringify(intent));badMime.artifact.mime='application/x-sh';
 await assert.rejects(validateCreateIntent(badMime),/ARTIFACT_FORMAT_MISMATCH/);
 const override=JSON.parse(JSON.stringify(intent));override.controls.overwriteAllowed=true;
 await assert.rejects(validateCreateIntent(override),/PERMISSION_GATES_REQUIRED/);
 const outside=JSON.parse(JSON.stringify(intent));outside.target.filename='../my-secret.md';
 await assert.rejects(validateCreateIntent(outside),/DRIVE_SAFE_FILENAME_REQUIRED/);
 assert.equal(calls,0);
});

test('GitHub write adapter creates on specifically selected non-default branch, then verifies same branch bytes',async()=>{
 const intent=await make();intent.provider='github';intent.target={owner:'the-static-collective',repo:'reLATTE',path:'docs/real-work.md',
 branch:'experiment/spawn-025-solo-executor-connector-bridge',expectedExistingSha:null};intent.controls.scope='GitHub App contents:write on one selected repository';
 const calls=[];const response=async(url,opts)=>{
  calls.push({url,opts});
  if(opts.method==='PUT'){
   const data=JSON.parse(opts.body);
   assert.equal(data.branch,'experiment/spawn-025-solo-executor-connector-bridge');
   assert.equal(Buffer.from(data.content,'base64').toString('utf8'),intent.artifact.body);
   assert.ok(!Object.hasOwn(data,'sha'),'no overwrite field');
   return fake(201,{content:{sha:'read-back-sha',html_url:'https://github.com/the-static-collective/reLATTE/blob/experiment/spawn-025-solo-executor-connector-bridge/docs/real-work.md'}});
  }
  assert.match(url,/\?ref=experiment%2Fspawn-025-solo-executor-connector-bridge$/);
  return fake(200,{encoding:'base64',content:Buffer.from(intent.artifact.body,'utf8').toString('base64')});
 };
 const receipt=await createApprovedProviderFile({intent,token:'github-app-user-token-123456',approved:true,fetcher:response});
 assert.equal(receipt.status,'PROVIDER_READBACK_VERIFIED');
 assert.equal(receipt.provider,'github');
 assert.equal(calls.length,2);
 assert.match(receipt.remoteUrl,/docs\/real-work\.md/);
});

test('GitHub adapter cannot accidentally write default branch, workflow, .env, mismatched extension or existing file',async()=>{
 const intent=await make();intent.provider='github';intent.target={owner:'org',repo:'repo',path:'docs/real-work.md',branch:'main',expectedExistingSha:null};
 await assert.rejects(validateCreateIntent(intent),/GITHUB_CREATE_ONLY_PATH_REQUIRED/);
 intent.target.branch='work/explicit-user-approved';
 intent.target.path='.github/workflows/deploy.md';
 await assert.rejects(validateCreateIntent(intent),/GITHUB_CREATE_ONLY_PATH_REQUIRED/);
 intent.target.path='docs/real-work.md';intent.target.expectedExistingSha='existing-commit-sha';
 await assert.rejects(validateCreateIntent(intent),/GITHUB_CREATE_ONLY_PATH_REQUIRED/);
 intent.target.expectedExistingSha=null;
 const r=await validateCreateIntent(intent);assert.equal(r.target.branch,'work/explicit-user-approved');
 const refused=async()=>fake(422,{message:'exists'});
 await assert.rejects(createApprovedProviderFile({intent,token:'app-scoped-token-123456',approved:true,fetcher:refused}),/PROVIDER_GITHUB_HTTP_422/);
});
test('provider write never claims success if readback bytes differ from original, or provider URL missing',async()=>{
 const intent=await make();
 const mismatched=async(url,opts)=>opts.method==='POST'?
  fake(201,{id:'created-but-corrupt',webViewLink:'https://drive.google.com/file/d/observed/view'}):fake(200,'WRONG CONTENT');
 await assert.rejects(createApprovedProviderFile({intent,token:'valid-token-123456',approved:true,fetcher:mismatched}),/WRITE_READBACK_DIGEST_MISMATCH/);
 const absent=async(url,opts)=>opts.method==='POST'?fake(201,{id:'created-no-url'}):fake(200,intent.artifact.body);
 await assert.rejects(createApprovedProviderFile({intent,token:'valid-token-123456',approved:true,fetcher:absent}),/PROVIDER_LINK_NOT_RETURNED/);
});
test('narrow read listing uses drive.file scope context or one specified GitHub repository',async()=>{
 const fetcher=async(url)=>url.includes('googleapis')?fake(200,{files:[{id:'a',name:'existing.md',mimeType:'text/markdown'}]})
 :fake(200,[{name:'file.md',type:'file',path:'file.md'},{name:'dir',type:'dir'}]);
 const drive=await listAccessibleFiles({provider:'google-drive',token:'valid-drive-token-1234',fetcher});
 assert.equal(drive.files.length,1);assert.match(drive.boundary,/drive.file/);
 const gh=await listAccessibleFiles({provider:'github',token:'valid-github-token-1234',repository:'owner/repo',fetcher});
 assert.equal(gh.files.length,1);
 await assert.rejects(listAccessibleFiles({provider:'github',token:'valid-github-token-1234',repository:'*',fetcher}),/SELECT_ONE_GITHUB_REPOSITORY/);
});
