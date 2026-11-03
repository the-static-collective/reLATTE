// Offline single-file HTML generator. No imported JS, CDN, font or network.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const template=readFileSync(join(here,'owner-console-template.html'),'utf8');
const source=readFileSync(join(here,'delegation-core.mjs'),'utf8');
const token='/*__WF008_SHARED_CORE__*/';
if(template.split(token).length!==2)throw Error('missing or duplicated shared core insertion point');
if(/\bimport\s+.*from\s*['"]/.test(source))throw Error('browser JS must have no remote or relative imports');
if(!template.includes("connect-src 'none'"))throw Error('browser owner ceremony must not have network');
const html=template.replace(token,source);
const out=join(here,'..','dist','WORLD-FORGE-008-OWNER-CONSOLE.html');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,html,'utf8');
console.log(JSON.stringify({format:'world-forge/offline-owner-console/v0',output:out,
  bytes:Buffer.byteLength(html),remote_network_enabled:false,
  owner_key_exported:false,requires_explicit_browser_key_holder_action:true}));
