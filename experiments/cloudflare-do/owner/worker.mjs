// Privileged operator-only source Worker. It cannot publish or book appointments.
import { MysticalWhimseyOwner } from './owner.mjs';
export { MysticalWhimseyOwner };
const headers = { 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'" };
const respond = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'},
});
function sameSecret(a,b) {
  if (typeof a!=='string'||typeof b!=='string'||a.length===0||b.length===0)return false;
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
  let mismatch=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)mismatch|=(x[i]??0)^(y[i]??0);
  return mismatch===0;
}
async function boundedJson(request) {
  if(Number(request.headers.get('content-length')??'0')>8192) throw Error('TOO_LARGE');
  const reader=request.body?.getReader();
  if(!reader)throw Error('BAD_BODY');
  let received=0;
  const chunks=[];
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      received+=value.byteLength;
      if(received>8192)throw Error('TOO_LARGE');
      chunks.push(value);
    }
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(received);
  let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('BAD_BODY');}
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/health' && request.method==='GET')
      return respond({pilot:true,node:'owner',business_operation:false,live_publication:false});
    const identity=url.pathname==='/v0/identity' && request.method==='GET';
    const state=url.pathname==='/v0/outbox' && request.method==='GET';
    const propose=url.pathname==='/v0/propose' && request.method==='POST';
    if(!identity&&!state&&!propose) return respond({error:'not_found'},404);
    if(!env.MW_OPERATOR_TOKEN) return respond({error:'operator_token_not_configured'},503);
    if(!sameSecret(request.headers.get('Authorization'),'Bearer '+env.MW_OPERATOR_TOKEN))
      return respond({error:'unauthorized'},401);
    const owner=env.MW_OWNER.getByName('mw-owner-pilot-v0');
    try {
      if(identity)return respond(await owner.identity());
      if(state)return respond(await owner.state());
    } catch {return respond({error:'owner_state_unavailable'},503);}
    if(!/^sha256:[a-f0-9]{64}$/.test(env.MW_RECEIVER_FINGERPRINT??'')||
       !env.MW_RELAY_TOKEN||!env.MW_RECEIVER_SERVICE)
      return respond({error:'remote_not_configured'},503);
    if(!(request.headers.get('Content-Type')??'').toLowerCase().startsWith('application/json'))
      return respond({error:'json_required'},415);
    let requestBody;
    try {requestBody=await boundedJson(request);}
    catch(e){return respond({error:e.message},e.message==='TOO_LARGE'?413:400);}
    if(!requestBody || typeof requestBody!=='object' || Array.isArray(requestBody)
        ||Object.keys(requestBody).join('|')!=='hours')
      return respond({error:'expected_public_hours'},422);
    let prepared;
    try {prepared=await owner.prepare(requestBody.hours);}
    catch(e){return respond({error:e.message==='INVALID_PUBLIC_HOURS'?'invalid_public_hours':'owner_prepare_failed'},
      e.message==='INVALID_PUBLIC_HOURS'?422:503);}
    if(prepared.acknowledged)
      return respond({crossing_id:prepared.crossing.crossing_id,confirmed:true,duplicate:true,booked:false,published:false});
    try {
      const remote=await env.MW_RECEIVER_SERVICE.fetch(new Request('https://receiver-internal.invalid/v0/crossings',{
        method:'POST',headers:{
          Authorization:'Bearer '+env.MW_RELAY_TOKEN,
          'Content-Type':'application/json',
        },
        body:JSON.stringify(prepared.crossing),
      }));
      if(remote.status!==202 && remote.status!==200)
        return respond({error:'receiver_did_not_acknowledge',status:remote.status,pending:true},503);
      const result=await remote.json();
      if(result.crossing_id!==prepared.crossing.crossing_id || !result.receive_receipt || !result.disposition_receipt)
        return respond({error:'receiver_bad_response',pending:true},503);
      const confirmation=await owner.confirm(
        prepared.crossing.crossing_id,result.receive_receipt,
        result.disposition_receipt,env.MW_RECEIVER_FINGERPRINT,
      );
      return respond({...confirmation,published:false,booked:false,admitted:false},202);
    } catch {
      return respond({error:'receiver_transport_or_verification_failed',pending:true},503);
    }
  },
};
