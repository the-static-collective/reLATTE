/** Pure, deterministic capability-to-action planner; no AI or third-party services. */
const WHENS = new Set(['now','soon','later','unspecified']);
const KINDS = new Set(['music','food','transport','tools','question','general']);
const ACTION_IDS = new Set(['record-audio','record-video','art','catalog','announce','private-offer','later','stream']);
export function validateCartridge(value) {
  if (!value || value.schema !== 'relatte.live-offer-cartridge/v0' || value.authority !== 'PROPOSAL_ONLY' || value.remote_execution !== false) throw Error('INVALID_CARTRIDGE_BOUNDARY');
  if (!value.patterns || typeof value.patterns !== 'object' || !Array.isArray(value.actions) || value.actions.length < 3) throw Error('INVALID_CARTRIDGE_STRUCTURE');
  const seen = new Set();
  for (const [kind, patterns] of Object.entries(value.patterns)) {
    if (!KINDS.has(kind) || !Array.isArray(patterns) || patterns.some(x=>typeof x !== 'string' || !x.trim() || x.length > 80)) throw Error('INVALID_PATTERN');
  }
  for (const a of value.actions) {
    if (!ACTION_IDS.has(a.id) || seen.has(a.id) || typeof a.label !== 'string' || a.available !== true || !Array.isArray(a.next) || !Array.isArray(a.requires) || !Array.isArray(a.kinds) || !Array.isArray(a.times)) throw Error('INVALID_ACTION');
    if (a.kinds.some(x=>!KINDS.has(x)) || a.times.some(x=>!WHENS.has(x))) throw Error('INVALID_ACTION_SCOPE');
    seen.add(a.id);
  }
  for (const a of value.actions) if (a.next.some(x=>!seen.has(x))) throw Error('UNKNOWN_ACTION_EDGE');
  return true;
}
function hit(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^a-z0-9])'+escaped+'(?=$|[^a-z0-9])','i').test(text);
}
export function interpret(input, cartridge, whenOverride = null) {
  validateCartridge(cartridge);
  const text = String(input ?? '').trim().slice(0,420);
  const lower = text.toLowerCase();
  let when = 'unspecified';
  if (/\b(not now|another time|later|tomorrow|next week|next month|someday)\b/i.test(lower)) when = 'later';
  else if (/\b(now|right away|immediately|today|this minute|tonight|currently|available now)\b/i.test(lower)) when = 'now';
  else if (/\b(soon|this week|in a bit)\b/i.test(lower)) when = 'soon';
  if (whenOverride && WHENS.has(whenOverride)) when = whenOverride;
  const scores = Object.entries(cartridge.patterns).filter(([k])=>k!=='general').map(([kind,words])=>({kind,score:words.filter(w=>hit(lower,w)).length}));
  scores.sort((a,b)=>b.score-a.score || a.kind.localeCompare(b.kind));
  const kind = scores[0]?.score > 0 ? scores[0].kind : 'general';
  const minutes = /\b(\d{1,3})\s*(?:min|minutes?)\b/i.exec(text);
  const durationMinutes = minutes ? Math.min(Number(minutes[1]), 240) : null;
  return Object.freeze({ text, kind, when, durationMinutes, nowCandidate:when === 'unspecified' || when === 'now' });
}
const PREFS = Object.freeze({ 'record-audio':9, 'record-video':8, 'art':6, 'catalog':5, 'announce':4, 'private-offer':3, 'stream':2, 'later':1 });
export function propose(input, cartridge, {when=null, feedback={}}={}) {
  const intent=interpret(input,cartridge,when);
  const weighted=cartridge.actions.filter(a=>a.kinds.includes(intent.kind) && a.times.includes(intent.when));
  const actions = weighted.map(a=>({...a,rank:(PREFS[a.id]||0)+(intent.when==='now'&&['record-audio','record-video'].includes(a.id)?20:0)+Math.min(20,Math.max(0,Number(feedback[a.id])||0))})).sort((a,b)=>b.rank-a.rank || a.id.localeCompare(b.id));
  return {schema:'jarvis/capability-plan/v0',intent,actions,notice:'Local recommendations only. Recording requires explicit permission; private submission requires separate consent; no action has run.',cartridge:cartridge.id};
}
export function learn(feedback, actionId) {
  if (!ACTION_IDS.has(actionId)) throw Error('UNKNOWN_ACTION');
  const next = Object.create(null);
  for(const id of ACTION_IDS) if(Number.isSafeInteger(feedback?.[id]) && feedback[id]>0) next[id]=Math.min(20, feedback[id]);
  next[actionId]=Math.min(20,(next[actionId]||0)+1);
  return next;
}
