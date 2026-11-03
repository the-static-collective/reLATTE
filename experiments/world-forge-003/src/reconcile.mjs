// Cross-engine probe vocabulary; self-report, not a grant of authority.
export const FORMAT = 'world-forge/engine-probe/v0';
export const SOURCE_SHA256 = 'a8a7862f462a6927e1983cf299f930368a5745751695e8f4755a2c476f560966';
export const STATIONS = Object.freeze(['garden','forge','press','tree','council','gate','arcade']);
export const ENGINES = Object.freeze(['godot-4','minecraft-java-26.1.1']);
const FIELDS = ['format','source_sha256','engine','instance','station','states','actions','evidence_class','signature','observer','receiver'];
const STATES = ['BREACHED','DAMAGED','RESTORED'];
const ACTIONS = ['SALVAGE','REPAIR'];
const bare = x => x && typeof x === 'object' && !Array.isArray(x);
function exact(o,fields){return bare(o)&&Object.keys(o).length===fields.length&&fields.every(k=>Object.hasOwn(o,k));}
export function validateProbe(p){
  if(!exact(p,FIELDS))throw Error('unknown or missing probe fields');
  if(p.format!==FORMAT||p.source_sha256!==SOURCE_SHA256)throw Error('source or format mismatch');
  if(!ENGINES.includes(p.engine)||!['alpha','beta'].includes(p.instance)||!STATIONS.includes(p.station))throw Error('invalid world or station');
  if(!Array.isArray(p.states)||p.states.length!==3||!STATES.includes(p.states[0])||p.states[0]==='RESTORED'||p.states[1]!=='RESTORED'||p.states[2]!=='RESTORED')throw Error('invalid observed state sequence');
  if(!Array.isArray(p.actions)||JSON.stringify(p.actions)!==JSON.stringify(ACTIONS))throw Error('missing intermediate causal actions');
  if(p.evidence_class!=='ENGINE_SELF_REPORT'||p.signature!==null||p.observer!==null||p.receiver!=='HOLD')throw Error('unproven authority claim');
  return true;
}
export function compare(a,b){
  validateProbe(a);validateProbe(b);
  if(a.engine===b.engine||a.instance===b.instance)throw Error('need distinct engines and worlds');
  if(a.station!==b.station)throw Error('station mismatch');
  return {
    format:'world-forge/engine-comparison/v0',
    source_sha256:SOURCE_SHA256,
    engines:[a.engine,b.engine],instances:[a.instance,b.instance],station:a.station,
    same_procedure:JSON.stringify(a.actions)===JSON.stringify(b.actions),
    same_state_transition:a.states[0]===b.states[0]&&a.states.at(-1)===b.states.at(-1),
    evidence_class:'UNVERIFIED_ENGINE_SELF_REPORTS',
    native_signature_verified:false,independent_observer_verified:false,actual_external_replay_proven:false,
    receiver:'HOLD',automatic_admission:false,
    required_next:['Pinned raw engine logs','Independent fresh-world observer','Real Java 26.1.1 runtime execution','Native signature/ancestry check','Receiver-local consent']
  };
}
