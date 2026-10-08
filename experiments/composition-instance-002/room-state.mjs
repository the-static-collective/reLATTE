// Specimen ontology only. Neither parent nor normative core imports this file.
export const RUNTIME_ID = 'bounded-room-chest/v0';
export const initialState = () => ({ rooms: ['ROOM A', 'ROOM B'], edge: ['ROOM A', 'ROOM B'], agent: 'ROOM A', chest: { open: false, map_visible: false, contents: ['stone', 'map fragment'], map_fragment: { destination: 'ROOM B' } }, transitions: 0, observations: 0 });
export function transition(before, action) {
  const state = structuredClone(before);
  if (action === 'open-chest' && !state.chest.open) { state.agent = 'ROOM B'; state.chest.open = true; }
  else if (action === 'reveal-map' && state.chest.open && !state.chest.map_visible) state.chest.map_visible = true;
  else throw new Error('INVALID_RUNTIME_TRANSITION');
  if (++state.transitions > 2) throw new Error('RUNTIME_ACTION_BOUND');
  return state;
}
export function eligibleSemantic(action) { return action === 'open-chest' ? 'CHEST-OBSERVATION-DOOR' : action === 'reveal-map' ? 'MAP-FRAGMENT-OBSERVATION-DOOR' : null; }

export function observationFor(state, semantic) {
  if (!state.chest.open) throw new Error('RUNTIME_INTERFACE_NOT_ELIGIBLE');
  if (semantic === 'CHEST-OBSERVATION-DOOR') return { contents: [...state.chest.contents] };
  if (semantic === 'MAP-FRAGMENT-OBSERVATION-DOOR' && state.chest.map_visible) return { map_fragment: structuredClone(state.chest.map_fragment) };
  throw new Error('RUNTIME_INTERFACE_NOT_ELIGIBLE');
}
