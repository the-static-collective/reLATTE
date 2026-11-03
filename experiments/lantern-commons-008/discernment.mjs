/*
 * Lantern 008: small, inspectable, evidence-based creature policy.
 * Memory concerns this disposable GAME SESSION, never a human's worth.
 * No game commands, financial transfers, or world authority are granted here.
 */
const requireInt=(n,field)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('DISCERNMENT_INVALID_'+field);};
export function freshMemory(){
  return {schema:'lantern.creature-memory/v0',episodes:0,material_reciprocations:0,
    explicit_refusals:0,resource_constraints:0,unverified_claims:0,
    unresolved_mechanism_failures:0,last_outcome:'NOT_YET_OBSERVED'};
}
export function decide(memory,observation){
  if(memory?.schema!=='lantern.creature-memory/v0')throw Error('DISCERNMENT_INVALID_MEMORY');
  requireInt(observation?.self_items,'SELF_ITEMS');
  requireInt(observation?.partner_barrel_items,'PARTNER_ITEMS');
  if(!observation?.garden_dry)return {action:'OBSERVE',reason:'No present material need',effect:'NONE'};
  if(observation.self_items<2)return {action:'REQUEST_ASSISTANCE',reason:'Own materials insufficient',effect:'NONE'};
  // Evidence of the other contribution outranks any prior refusal, scarcity or false claim.
  if(observation.partner_barrel_items>=2)return {
    action:'RECIPROCATE_VERIFIED',reason:'Two actual game stone bricks observed in shared barrel',
    effect:'OFFER_OWN_ITEMS_ONLY'};
  if(memory.episodes===0 || memory.material_reciprocations>0 && memory.last_outcome==='SHARED_GARDEN_RESTORED')
    return {action:'OFFER_REVERSIBLY',reason:'Bounded first or previously reciprocated trial; exit stays possible',
      effect:'OFFER_OWN_ITEMS_ONLY'};
  return {action:'WAIT_FOR_MATERIAL_PROOF',
    reason:'A previous exchange remained unresolved; invite real contribution without overriding refusal',
    effect:'NONE'};
}
export function remember(memory,facts){
  if(memory?.schema!=='lantern.creature-memory/v0')throw Error('DISCERNMENT_INVALID_MEMORY');
  if(!['GIFT','DECLINE','UNABLE','CLAIM_GIFT'].includes(facts.partner_statement))
    throw Error('DISCERNMENT_UNKNOWN_STATEMENT');
  requireInt(facts.partner_barrel_items,'BARREL_ITEMS');
  if(typeof facts.garden_restored!=='boolean')throw Error('DISCERNMENT_INVALID_OUTCOME');
  if(typeof facts.grower_material_moved!=='boolean')throw Error('DISCERNMENT_INVALID_OWN_ACTION');
  if(facts.garden_restored && (facts.partner_barrel_items<2 || !facts.grower_material_moved))
    throw Error('DISCERNMENT_CONTRADICTORY_WORLD_CLAIM');
  const next={...memory,episodes:memory.episodes+1};
  if(facts.garden_restored){
    next.material_reciprocations++;
    next.last_outcome='SHARED_GARDEN_RESTORED';
  } else if(facts.partner_statement==='DECLINE'){
    next.explicit_refusals++;
    next.last_outcome='REFUSAL_ACCEPTED';
  } else if(facts.partner_statement==='UNABLE'){
    next.resource_constraints++;
    next.last_outcome='SCARCITY_RECOGNIZED';
  } else if(facts.partner_statement==='CLAIM_GIFT' && facts.partner_barrel_items<2){
    next.unverified_claims++;
    next.last_outcome='CLAIM_NOT_MATCHED_BY_GAME_MATERIAL';
  } else {
    next.unresolved_mechanism_failures++;
    next.last_outcome='NO_COMMON_EFFECT_OBSERVED';
  }
  return next;
}
