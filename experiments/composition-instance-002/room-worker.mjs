import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { RUNTIME_ID, transition, observationFor } from './room-state.mjs';
const path = process.argv[2];
let state = JSON.parse(readFileSync(path, 'utf8'));
const save = () => { writeFileSync(path + '.tmp', JSON.stringify(state)); renameSync(path + '.tmp', path); };
process.on('message', ({ id, action, semantic }) => {
  try {
    const before = structuredClone(state);
    if (action === 'observe') {
      if (!state.chest.open || (semantic === 'MAP-FRAGMENT-OBSERVATION-DOOR' && !state.chest.map_visible)) throw new Error('RUNTIME_INTERFACE_NOT_ELIGIBLE');
      if (++state.observations > 8) throw new Error('RUNTIME_OBSERVATION_BOUND');
    } else state = transition(state, action);
    save(); process.send({ id, runtime_id: RUNTIME_ID, before, after: state, action, ...(action === 'observe' ? { observation: observationFor(state, semantic) } : {}) });
  } catch (error) { process.send({ id, error: error.message }); }
});
process.send({ ready: true, runtime_id: RUNTIME_ID });
