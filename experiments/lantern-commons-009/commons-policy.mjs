/**
 * LANTERN-009: identical policy code used independently by two in-game
 * participants. Neither receives a scenario label, the partner's private
 * inventory, its hidden reserve, nor an operator's desired outcome.
 *
 * Trial offers are bounded and recoverable. A prior refusal is NOT a blacklist.
 * Trust is specific to witnessed game mechanisms, never moral judgment.
 */
const integer=(n,name)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('COMMONS_009_INVALID_'+name);};
export function newMemory(role){
  if(!['grower','mason'].includes(role))throw Error('COMMONS_009_ROLE');
  return {schema:'lantern.cooperation-agent-memory/v0',role,episodes:0,
    successes:0,unreciprocated_offers:0,protected_need_declines:0,
    last_trial_episode:0,last_result:'UNKNOWN'};
}
export function choose(memory,observation){
  if(memory?.schema!=='lantern.cooperation-agent-memory/v0' ||
    !['grower','mason'].includes(memory.role))throw Error('COMMONS_009_MEMORY');
  for(const [field,value] of Object.entries({
    inventory:observation?.inventory,protected_reserve:observation?.protected_reserve,
    partner_deposit:observation?.partner_deposit,episode:observation?.episode
  }))integer(value,field.toUpperCase());
  if(observation.episode!==memory.episodes+1)
    throw Error('COMMONS_009_EPISODE_ORDER');
  if(typeof observation.garden_dry!=='boolean')throw Error('COMMONS_009_ENVIRONMENT');
  if(!observation.garden_dry)return {act:'OBSERVE',reason:'No unmet public need',may_move_own_items:false};
  if(observation.inventory<observation.protected_reserve+2)
    return {act:'PROTECT_OWN_NEED',reason:'Cannot contribute two items without violating declared reserve',may_move_own_items:false};
  if(observation.partner_deposit>=2)
    return {act:'RECIPROCATE_MATERIAL',reason:'Partner deposited actual items, not just a verbal claim',may_move_own_items:true};
  if(memory.episodes===0)
    return {act:'TRIAL_GIFT',reason:'Initial reversible pilot in the shared garden',may_move_own_items:true};
  if(memory.last_result==='SHARED_REPAIR')
    return {act:'REPEAT_WITNESSED_GIFT',reason:'Last observed shared repair actually worked',may_move_own_items:true};
  if(observation.episode-memory.last_trial_episode>=2)
    return {act:'REOPEN_REVERSIBLY',reason:'Retry a protected, revocable invitation after time',may_move_own_items:true};
  return {act:'WAIT_FOR_EVIDENCE',reason:'A prior round was unresolved; wait for new physical evidence',may_move_own_items:false};
}
export function learn(memory,observation){
  if(memory?.schema!=='lantern.cooperation-agent-memory/v0')throw Error('COMMONS_009_MEMORY');
  if(observation?.episode!==memory.episodes+1)throw Error('COMMONS_009_EPISODE_ORDER');
  for(const field of ['own_gift','partner_gift','garden_restored','protected_need']){
    if(typeof observation[field]!=='boolean')throw Error('COMMONS_009_INVALID_'+field.toUpperCase());
  }
  if(observation.garden_restored && !(observation.own_gift&&observation.partner_gift))
    throw Error('COMMONS_009_RESTORED_WITHOUT_BOTH_MATERIAL_GIFTS');
  const next={...memory,episodes:memory.episodes+1};
  if(observation.own_gift)next.last_trial_episode=observation.episode;
  if(observation.garden_restored){
    next.successes++;
    next.last_result='SHARED_REPAIR';
  }else if(observation.protected_need){
    next.protected_need_declines++;
    next.last_result='PROTECTED_NEED';
  }else if(observation.own_gift){
    next.unreciprocated_offers++;
    next.last_result='UNRECIPROCATED_OFFER';
  }else next.last_result='WAIT_OR_REFUSAL';
  return next;
}
