/* Avoid basename-sensitive historical compose.mjs auto-CLI guards. */
import {makePack} from './compose.mjs';
const result=await makePack();
console.log(JSON.stringify(result,null,2));
