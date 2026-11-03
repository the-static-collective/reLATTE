// Local CLI only; never uploads signed user grants or user public keys.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {
  readGrantFile,readRevocationFile,enrollmentPreview,enrollLocalSigner,
  evaluateLocalPolicy,reviewProposalInNativeReceiver,importSignedRevocation
} from './local-bridge.mjs';
function usage(){
  throw Error('Usage:\n'+
    '  preview SIGNED_GRANT.json OUTPUT_PREVIEW.json\n'+
    '  enroll SIGNED_GRANT.json LOCAL_TRUST_DIR CONFIRMED_PUBLIC_FINGERPRINT ISO_TIME\n'+
    '  policy SIGNED_GRANT.json LOCAL_TRUST_DIR ACTION ISO_TIME OUTPUT.json\n'+
    '  review SIGNED_GRANT.json LOCAL_TRUST_DIR ACTION ISO_TIME REQUEST_ID OUTPUT.json\n'+
    '  revoke SIGNED_GRANT.json LOCAL_TRUST_DIR SIGNED_REVOCATION.json OUTPUT.json');
}
const [verb,...args]=process.argv.slice(2);
const save=(path,value)=>{if(!path)usage();writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'})};
if(verb==='preview'){
  const [source,out]=args;if(!source||!out)usage();
  const p=await enrollmentPreview(await readGrantFile(source));
  save(out,p);
  console.log('WF009_PREVIEW_PRIVATE='+JSON.stringify({
    signature_verified:p.grant_signature_valid,owner_key_fingerprint:p.owner_fingerprint,
    enrolled:false,identity_verified:false
  }));
}else if(verb==='enroll'){
  const [source,root,confirm,at]=args;if(!source||!root||!confirm||!at)usage();
  const p=await enrollLocalSigner({
    grant:await readGrantFile(source),root,confirmedFingerprint:confirm,at
  });
  console.log('WF009_TRUST_LOCAL_ONLY='+JSON.stringify({
    locally_confirmed_fingerprint:p.recognized_fingerprint,
    identity_verified:false,private_owner_key_received:false,external_service_updated:false
  }));
}else if(verb==='policy'){
  const [source,root,action,at,out]=args;if(!source||!root||!action||!at||!out)usage();
  const p=await evaluateLocalPolicy({grant:await readGrantFile(source),root,action,at});
  save(out,p);
  console.log('WF009_POLICY='+JSON.stringify({decision:p.local_disposition,action,reason:p.reason,
    local_review_only:true}));
}else if(verb==='review'){
  const [source,root,action,at,requestId,out]=args;
  if(!source||!root||!action||!at||!requestId||!out)usage();
  const p=await reviewProposalInNativeReceiver({grant:await readGrantFile(source),root,
    action,at,requestId});
  save(out,p);
  console.log('WF009_NATIVE_RECEIVER='+JSON.stringify({
    native_crossing_id:p.native_crossing_id,
    disposition:p.decision,native_receipts_verified:p.native_receiver_receipts_verified,
    user_private_key_transferred:false,automatic_execution:false,automatic_merge:false
  }));
}else if(verb==='revoke'){
  const [source,root,revocationPath,out]=args;
  if(!source||!root||!revocationPath||!out)usage();
  const p=await importSignedRevocation({
    grant:await readGrantFile(source),root,revocation:await readRevocationFile(revocationPath)
  });
  save(out,p);
  console.log('WF009_SIGNED_REVOCATION_LOCALLY_RECORDED='+JSON.stringify({
    local_revocations:p.local_revocations,remote_broadcast:false
  }));
}else usage();
