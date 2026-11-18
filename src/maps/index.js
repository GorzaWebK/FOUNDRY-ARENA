// Map registry. To add a map: create a data file like the ones here, import it
// and add it to MAPS. `npm run check:map` validates every map in this list.

import foundry from './arena.js';
import span from './span.js';
import cloister from './cloister.js';
import depot from './depot.js';
import skyline from './skyline.js';
import dockyard from './dockyard.js';
import steelworks from './steelworks.js';

import { setBuiltinMaps, customMap } from '../mapspec.js';

export const MAPS = [foundry, span, cloister, depot, skyline, dockyard, steelworks];
export const DEFAULT_MAP = foundry.id;
setBuiltinMaps(MAPS); // custom maps borrow their look from these

/** A built-in map, or a custom one registered this session (see mapspec.js). */
export function getMap(id) {
  return MAPS.find((m) => m.id === id) || customMap(id) || MAPS[0];
}
