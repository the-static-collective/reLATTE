import { DurableObject } from 'cloudflare:workers';
import { SqliteReceiver, CONFIG } from './receiver.mjs';

const MAX_BYTES = 16 * 1024;
const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow', 'Content-Security-Policy':"default-src 'none'" };
const reply = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'},
});
async function readBounded(request) {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BYTES) throw Error('TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw Error('EMPTY_BODY');
  let bytes = 0, chunks = [];
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw Error('TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const joined = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) { joined.set(chunk,at); at+=chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)); }
  catch { throw Error('INVALID_JSON'); }
}
function sameSecret(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const encoder = new TextEncoder();
  const x=encoder.encode(a), y=encoder.encode(b);
  // Fixed-work comparison for equal-size tokens; use a long random token, not a password.
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) diff |= (x[i]??0)^(y[i]??0);
  return diff===0;
}
export class MysticalWhimseyReceiver extends DurableObject {
  constructor(ctx, env) {
    super(ctx,env);
    this.receiver = new SqliteReceiver(ctx.storage);
    // Crash/restart and corruption must not silently yield an empty receiver.
    ctx.blockConcurrencyWhile(async () => {
      await this.receiver.replay(env.MW_TRUSTED_SOURCE_FINGERPRINT);
    });
  }
  async ingest(crossing) {
    return this.receiver.ingest(crossing,this.env.MW_TRUSTED_SOURCE_FINGERPRINT);
  }
  async state() { return this.receiver.snapshot(); }
  async identity() { return this.receiver.identity(); }
}
export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return reply({pilot:true,status:'edge-scaffold',accepting_bookings:false,
        accepting_customer_information:false, publishes_service_hours:false});
    }
    const isIngest = url.pathname === '/v0/crossings' && request.method === 'POST';
    const isState = url.pathname === '/v0/state' && request.method === 'GET';
    const isIdentity = url.pathname === '/v0/identity' && request.method === 'GET';
    if (!isIngest && !isState && !isIdentity) return reply({error:'not_found'},404);
    // Safe even when a Worker has been deployed before secrets were provisioned.
    if (!env.MW_OPERATOR_TOKEN || !env.MW_TRUSTED_SOURCE_FINGERPRINT
        || !/^sha256:[a-f0-9]{64}$/.test(env.MW_TRUSTED_SOURCE_FINGERPRINT)) {
      return reply({error:'pilot_not_configured'},503);
    }
    if (!sameSecret(request.headers.get('Authorization'), 'Bearer '+env.MW_OPERATOR_TOKEN)) {
      return reply({error:'unauthorized'},401);
    }
    let body;
    if (isIngest) {
      if (!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json')) {
        return reply({error:'json_required'},415);
      }
      try { body=await readBounded(request); }
      catch (error) { return reply({error:error.message},error.message==='TOO_LARGE'?413:400); }
    }
    const stub = env.MW_RECEIVER.getByName('mw-edge-pilot-v0');
    try {
      if (isState) return reply(await stub.state());
      if (isIdentity) return reply(await stub.identity());
      const result = await stub.ingest(body);
      return reply(result,result.duplicate?200:202);
    } catch (error) {
      // Never echo packet content, private key, stack trace or persistent state.
      const code = error?.message === 'SOURCE_KEY_NOT_ENROLLED' ? 403 :
        error?.message === 'INVALID_PILOT_CROSSING' ? 422 : 503;
      return reply({error: code===503?'pilot_unavailable':error.message},code);
    }
  },
};
