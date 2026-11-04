// SPAWN 024 / reLATTE Relay — signed, bounded, consented discovery and poll transport.
// This function NEVER confirms identity, stock, third-party consent, or physical delivery.
// Data is private behind RLS. Opted-in sanitized offer projections are the only public discovery data.
import {createClient} from "npm:@supabase/supabase-js@2.78.0";

const URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!URL||!KEY)throw Error("RELAY_SERVER_NOT_CONFIGURED");
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const BASE="/functions/v1/relatte-relay-024";
const ORIGINS="*"; // Non-cookie capability requests; permits manually opened file:// cartridges.
const HEAD={"content-type":"application/json; charset=utf-8","cache-control":"no-store, private","referrer-policy":"no-referrer","x-content-type-options":"nosniff",
 "access-control-allow-origin":ORIGINS,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"content-type",
 "access-control-max-age":"600","vary":"Origin"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9_-]+$/;
const CATS=["tools","materials","method","art","skill","digital"];
const SCOPES=["review","test","copy"];
const STATES=["HOLD","ADMIT","REFUSE"];
const UNIT="one bounded item/use";
const SCHEMA="relatte/crossing-packet/v1";
const PII=/(?:https?:\/\/|www\.|[^\s]+@[^\s]+\.[^\s]+|(?:\+?\d[\d\s().-]{8,}\d)|<|>|(?:\b(?:password|secret key|private key|home address|bank account|account number|ssn|case number)\b)|(?:\b\d{1,5}\s+[a-z]+\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln)\b))/i;
class Failure extends Error{constructor(code,status=400){super(code);this.status=status}}
const err=(code,status=400)=>{throw new Failure(code,status)};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const exact=(o,keys)=>!!(o&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).sort().join("|")===keys.slice().sort().join("|"));
const safe=(x,min=12,max=100)=>typeof x==="string"&&x.trim().length>=min&&x.length<=max&&!PII.test(x);
const uid=x=>typeof x==="string"&&UUID.test(x);
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,"0")).join("");
function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("")}
function pubOk(p){return exact(p,["kty","crv","x","y"])&&p.kty==="EC"&&p.crv==="P-256"&&
 typeof p.x==="string"&&typeof p.y==="string"&&p.x.length===43&&p.y.length===43&&B64.test(p.x)&&B64.test(p.y)}
function sameIssuer(a,b){return a&&b&&a.x===b.x&&a.y===b.y}
function bodyOk(k,b){
 if(k==="OFFER")return exact(b,["category","label","quantity","unit","scope"])&&CATS.includes(b.category)&&safe(b.label)&&Number.isInteger(b.quantity)&&b.quantity>=1&&b.quantity<=20&&b.unit===UNIT&&SCOPES.includes(b.scope);
 if(k==="INTEREST")return exact(b,["quantity","unit","reason"])&&Number.isInteger(b.quantity)&&b.quantity>=1&&b.quantity<=20&&b.unit===UNIT&&safe(b.reason);
 if(k==="DECISION")return exact(b,["decision","note"])&&STATES.includes(b.decision)&&safe(b.note);
 if(k==="ACK")return exact(b,["status","note"])&&b.status==="SEEN_NOT_DELIVERED"&&safe(b.note);
 return false;
}
function linkOk(k,l){
 if(k==="OFFER")return l===null;
 if(k==="INTEREST")return exact(l,["offerId","offerHash"])&&uid(l.offerId)&&HEX.test(l.offerHash);
 if(k==="DECISION")return exact(l,["offerId","offerHash","interestId","interestHash"])&&uid(l.offerId)&&uid(l.interestId)&&HEX.test(l.offerHash)&&HEX.test(l.interestHash);
 if(k==="ACK")return exact(l,["offerId","offerHash","interestId","interestHash","decisionId","decisionHash"])&&uid(l.offerId)&&uid(l.interestId)&&uid(l.decisionId)&&HEX.test(l.offerHash)&&HEX.test(l.interestHash)&&HEX.test(l.decisionHash);
 return false;
}
function parseSignature(s){if(typeof s!=="string"||s.length!==86||!B64.test(s))err("INVALID_SIGNATURE");
 const x=s.replaceAll("-","+").replaceAll("_","/");return Uint8Array.from(atob(x+"=".repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));
}
async function checked(packet,kind){
 if(!exact(packet,["schema","version","kind","id","issuedAt","expiresAt","issuer","link","body","signature"])||
  packet.schema!==SCHEMA||packet.version!==1||packet.kind!==kind||!uid(packet.id)||!pubOk(packet.issuer)||!bodyOk(kind,packet.body)||!linkOk(kind,packet.link))err("INVALID_SIGNED_PACKET");
 const issued=Date.parse(packet.issuedAt),expires=Date.parse(packet.expiresAt),now=Date.now();
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now+120000||issued<now-900000||expires<=now||expires-issued>3600000+60000||expires-issued<=0)err("EXPIRED_OR_STALE_PACKET");
 const {signature,...unsigned}=packet;
 const asText=JSON.stringify(packet);
 if(asText.length>3000)err("SIGNED_PACKET_TOO_LARGE",413);
 let key;try{key=await crypto.subtle.importKey("jwk",{...packet.issuer,ext:true,key_ops:["verify"]},{name:"ECDSA",namedCurve:"P-256"},false,["verify"])}
 catch{err("INVALID_PUBLIC_KEY")}
 let ok=false;
 try{ok=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,parseSignature(signature),new TextEncoder().encode(JSON.stringify(unsigned)))}
 catch{err("INVALID_SIGNATURE")}
 if(!ok)err("SIGNATURE_MISMATCH",403);
 return {packet,wire:asText,hash:await sha(asText)};
}
async function jsonBody(req){
 const length=Number(req.headers.get("content-length")||0);
 if(length>7000)err("REQUEST_TOO_LARGE",413);
 const raw=await req.text();if(raw.length>7000)err("REQUEST_TOO_LARGE",413);
 let obj;try{obj=JSON.parse(raw)}catch{err("INVALID_JSON")}
 if(!obj||typeof obj!=="object"||Array.isArray(obj))err("INVALID_JSON");
 return obj;
}
async function quota(req,action,holder=""){
 const now=new Date(),day=now.toISOString().slice(0,10),hour=now.toISOString().slice(0,13).replace("T",":");
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").slice(0,64);
 const fingerprint=(await sha("relatte-024|"+KEY+"|"+day+"|"+ip)).slice(0,24);
 const globalMax={publish:120,interest:300,discover:5000,status:10000,decision:300,ack:300,withdraw:120};
 const limit=action==="publish"?8:action==="interest"?30:action==="status"?200:action==="discover"?400:50;
 const checks=[["r24:"+action+":g",day,globalMax[action]||1000],["r24:"+action+":ip:"+fingerprint,action==="status"?hour:day,limit]];
 if(holder)checks.push(["r24:"+action+":k:"+(await sha(holder)).slice(0,24),hour,action==="status"?90:25]);
 for(const [p_key,p_period,p_max] of checks){
  const {data,error}=await db.rpc("commons_inbox_consume_quota",{p_key,p_period,p_max});
  if(error)err("RELAY_RATE_LIMIT_BACKEND_UNAVAILABLE",503);
  if(!data)err("RATE_LIMITED",429);
 }
}
async function currentOffer(id){
 if(!uid(id))err("UNKNOWN_OFFER",404);
 const {data,error}=await db.from("relatte_relay_024_offers").select("*").eq("id",id).maybeSingle();
 if(error)err("RELAY_DATABASE_UNAVAILABLE",503);
 if(!data)err("UNKNOWN_OFFER",404);
 return data;
}
function fresh(o){return o.state!=="WITHDRAWN"&&o.state!=="CLOSED"&&Date.parse(o.expires_at)>Date.now()}
async function currentInterest(offerId){
 const {data,error}=await db.from("relatte_relay_024_interests").select("*").eq("offer_id",offerId).maybeSingle();
 if(error)err("RELAY_DATABASE_UNAVAILABLE",503);
 return data;
}
async function authorized(o,secret,kind){
 if(typeof secret!=="string"||!HEX.test(secret))err("PRIVATE_CAPABILITY_REQUIRED",403);
 const want=await sha(secret);
 if(kind==="owner"&&want!==o.owner_hash)err("NO_ACCESS",403);
 if(kind==="guest"){const i=await currentInterest(o.id);if(!i||want!==i.guest_hash)err("NO_ACCESS",403);return i}
 return null;
}
async function discovery(req,url){
 await quota(req,"discover");
 const category=url.searchParams.get("category")||"all";
 if(category!=="all"&&!CATS.includes(category))err("BAD_CATEGORY");
 let q=db.from("relatte_relay_024_offers").select("id,category,scope,label,quantity,created_at,expires_at,packet")
  .eq("state","OPEN").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(25);
 if(category!=="all")q=q.eq("category",category);
 const {data,error}=await q;
 if(error)err("RELAY_DISCOVERY_UNAVAILABLE",503);
 return reply({schema:"relatte/relay-discovery/v1",discovered:(data||[]).map(x=>({
  id:x.id,category:x.category,scope:x.scope,label:x.label,quantity:x.quantity,expiresAt:x.expires_at,
  packet:JSON.parse(x.packet),trust:"SELF_REPORTED_SIGNED_SESSION_ONLY"
 })),realWorldVerified:false,notice:"Public opt-in reports, not verified goods/identities. No contact or pickup details."});
}
async function publish(req,body){
 if(!exact(body,["action","consent","packet"])||body.consent!==true)err("PUBLISH_REQUIRES_EXPLICIT_CONSENT");
 const proof=await checked(body.packet,"OFFER");
 await quota(req,"publish");
 const secret=token(),validUntil=new Date(body.packet.expiresAt).toISOString();
 const row={category:body.packet.body.category,label:body.packet.body.label,quantity:body.packet.body.quantity,
  scope:body.packet.body.scope,expires_at:validUntil,packet_id:body.packet.id,packet_hash:proof.hash,packet:proof.wire,owner_hash:await sha(secret)};
 const {data,error}=await db.from("relatte_relay_024_offers").insert(row).select("id,expires_at").single();
 if(error){if(error.code==="23505")err("OFFER_ALREADY_PUBLISHED",409);err("RELAY_STORAGE_UNAVAILABLE",503)}
 return reply({ok:true,offerId:data.id,ownerSecret:secret,expiresAt:data.expires_at,
  status:"PUBLIC_SELF_REPORTED_OFFER",verified:"SESSION_SIGNATURE_ONLY",notice:"Keep this local secret in this tab. No physical item has been verified or reserved."},201);
}
async function interest(req,body){
 if(!exact(body,["action","consent","offerId","packet"])||body.consent!==true)err("INTEREST_REQUIRES_EXPLICIT_CONSENT");
 const offer=await currentOffer(body.offerId);
 if(offer.state!=="OPEN"||!fresh(offer))err("OFFER_NOT_OPEN",409);
 const proof=await checked(body.packet,"INTEREST");
 if(sameIssuer(proof.packet.issuer,JSON.parse(offer.packet).issuer))err("INDEPENDENT_SESSION_REQUIRED");
 if(proof.packet.link.offerId!==JSON.parse(offer.packet).id||proof.packet.link.offerHash!==offer.packet_hash||proof.packet.body.quantity>offer.quantity)err("INTEREST_SCOPE_MISMATCH",409);
 await quota(req,"interest",body.offerId);
 const secret=token();
 const {data,error}=await db.from("relatte_relay_024_interests")
  .insert({offer_id:offer.id,packet_id:proof.packet.id,packet_hash:proof.hash,packet:proof.wire,guest_hash:await sha(secret)})
  .select("id").single();
 if(error){if(error.code==="23505")err("OFFER_ALREADY_HAS_AN_INTEREST",409);err("RELAY_STORAGE_UNAVAILABLE",503)}
 const {error:advanceErr}=await db.from("relatte_relay_024_offers").update({state:"ENGAGED"}).eq("id",offer.id).eq("state","OPEN");
 if(advanceErr)err("INTEREST_SAVED_STATUS_UNAVAILABLE",503);
 return reply({ok:true,offerId:offer.id,interestId:data.id,guestSecret:secret,state:"INTEREST_RECORDED",
  notice:"The signed interest is held for the provider's scoped decision. No use or delivery is authorized."},201);
}
async function status(req,body){
 if(!exact(body,["action","offerId","secret","side"])||!["owner","guest"].includes(body.side))err("INVALID_STATUS_REQUEST");
 const offer=await currentOffer(body.offerId);
 await quota(req,"status",body.secret);
 const i=await authorized(offer,body.secret,body.side);
 const row=i||await currentInterest(offer.id);
 return reply({offerId:offer.id,side:body.side,state:offer.state,expiresAt:offer.expires_at,
  interest:body.side==="owner"&&row?JSON.parse(row.packet):null,
  decision:body.side==="guest"&&row?.decision_packet?JSON.parse(row.decision_packet):null,
  ack:body.side==="owner"&&row?.ack_packet?JSON.parse(row.ack_packet):null,
  notice:"Messages are signed and self-attested. No physical outcome is verified or implied."});
}
async function decision(req,body){
 if(!exact(body,["action","offerId","secret","packet"]))err("INVALID_DECISION_REQUEST");
 const offer=await currentOffer(body.offerId);
 await authorized(offer,body.secret,"owner");
 if(!fresh(offer)||offer.state!=="ENGAGED")err("OFFER_NOT_NEGOTIABLE",409);
 const i=await currentInterest(offer.id);
 if(!i||i.decision_packet)err("DECISION_ALREADY_SET_OR_NO_INTEREST",409);
 const proof=await checked(body.packet,"DECISION");
 if(!sameIssuer(proof.packet.issuer,JSON.parse(offer.packet).issuer)||proof.packet.link.offerId!==JSON.parse(offer.packet).id||
   proof.packet.link.offerHash!==offer.packet_hash||proof.packet.link.interestId!==JSON.parse(i.packet).id||
   proof.packet.link.interestHash!==i.packet_hash)err("DECISION_NOT_IN_CHAIN",403);
 await quota(req,"decision",body.secret);
 const {data,error}=await db.from("relatte_relay_024_interests")
 .update({decision_packet:proof.wire,decision_hash:proof.hash})
 .eq("offer_id",offer.id).is("decision_packet",null).select("id").maybeSingle();
 if(error||!data)err("DECISION_REJECTED_OR_RACED",409);
 return reply({ok:true,state:"SIGNED_DECISION_RELAYED",choice:body.packet.body.decision,
  notice:"ADMIT means only the original scope; no ownership, delivery or field success claim."});
}
async function ack(req,body){
 if(!exact(body,["action","offerId","secret","packet"]))err("INVALID_ACK_REQUEST");
 const offer=await currentOffer(body.offerId);
 const i=await authorized(offer,body.secret,"guest");
 if(!fresh(offer)||offer.state!=="ENGAGED"||!i.decision_packet||i.ack_packet)err("ACK_NOT_AVAILABLE",409);
 const proof=await checked(body.packet,"ACK");
 if(!sameIssuer(proof.packet.issuer,JSON.parse(i.packet).issuer)||proof.packet.link.offerId!==JSON.parse(offer.packet).id||
  proof.packet.link.offerHash!==offer.packet_hash||proof.packet.link.interestId!==JSON.parse(i.packet).id||
  proof.packet.link.interestHash!==i.packet_hash||proof.packet.link.decisionId!==JSON.parse(i.decision_packet).id||
  proof.packet.link.decisionHash!==i.decision_hash)err("ACK_NOT_IN_CHAIN",403);
 await quota(req,"ack",body.secret);
 const {data,error}=await db.from("relatte_relay_024_interests").update({ack_packet:proof.wire,ack_hash:proof.hash})
  .eq("id",i.id).is("ack_packet",null).select("id").maybeSingle();
 if(error||!data)err("ACK_REJECTED_OR_RACED",409);
 await db.from("relatte_relay_024_offers").update({state:"CLOSED"}).eq("id",offer.id).eq("state","ENGAGED");
 return reply({ok:true,state:"SIGNED_ACK_SAVED",status:"SEEN_NOT_DELIVERED",
  notice:"Signed permission chain complete. This proves no real-world transaction or delivery."});
}
async function withdraw(req,body){
 if(!exact(body,["action","offerId","secret"]))err("INVALID_WITHDRAWAL_REQUEST");
 const offer=await currentOffer(body.offerId);
 await authorized(offer,body.secret,"owner");
 await quota(req,"withdraw",body.secret);
 const i=await currentInterest(offer.id);
 if(i?.decision_packet)err("CANNOT_RETRACT_ALREADY_SIGNED_DECISION",409);
 const {data,error}=await db.from("relatte_relay_024_offers").update({state:"WITHDRAWN"})
  .eq("id",offer.id).in("state",["OPEN","ENGAGED"]).select("id").maybeSingle();
 if(error||!data)err("OFFER_NOT_WITHDRAWABLE",409);
 return reply({ok:true,state:"WITHDRAWN",notice:"No longer discoverable; unverified historical signed packets may still be held separately by recipients."});
}
Deno.serve(async req=>{
 try{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:HEAD});
  const url=new URL(req.url),path=url.pathname.replace(/\/$/,"");
  if(path!==BASE&&path!=="/relatte-relay-024")return reply({error:"NOT_FOUND"},404);
  if(req.method==="GET"){
   if(url.searchParams.get("health")==="1")return reply({ok:true,version:24,protocol:SCHEMA,publicDiscovery:true,sessionKeyOnly:true,realWorldVerified:false,delivery:"OPT_IN_HTTP_POLL",maxOfferMinutes:60});
   if(url.searchParams.get("action")==="discover")return await discovery(req,url);
   return reply({schema:"relatte/relay-manifest/v1",status:"ONLINE_RELAY",version:24,transport:"POLL_NOT_PUSH",
     operations:["publish","discover","interest","status","decision","ack","withdraw"],
     trust:"SELF_REPORTED_SESSION_SIGNATURE_ONLY",realWorldVerified:false});
  }
  if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
  const b=await jsonBody(req);
  if(b.action==="publish")return await publish(req,b);
  if(b.action==="interest")return await interest(req,b);
  if(b.action==="status")return await status(req,b);
  if(b.action==="decision")return await decision(req,b);
  if(b.action==="ack")return await ack(req,b);
  if(b.action==="withdraw")return await withdraw(req,b);
  return reply({error:"UNKNOWN_ACTION"},400);
 }catch(e){
  const status=e instanceof Failure?e.status:503;
  return reply({error:e instanceof Failure?e.message:"RELAY_UNAVAILABLE",confirmed:false},status);
 }
});
