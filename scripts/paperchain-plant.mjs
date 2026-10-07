// GERMINATION-002 — held PAPERCHAIN seed + Fatherhand capacity + explicit PLANT -> fresh descendant.
// reLATTE binds foreign capacity evidence without absorbing Fatherhand semantics.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LocalReceiver,
  buildCulturalDescendantDraft,
  createCulturalUptake,
  generateP256KeyPair,
  projectField,
  sealCrossingEnvelope,
  sealFieldLens,
  sha256Hex,
  verifyCrossingEnvelope,
  verifyCulturalDescendant,
  verifyReceipt,
} from '../src/index.ts';

const FATHERHAND_SCHEMA='tranchnode/fatherhand-paperchain-plant-witness/v0.1';
const FATHERHAND_RECEIPT_SCHEMA='tranchnode/fatherhand-authority-validation-receipt/v0.1';
const PLANT_CAPABILITY='paperchain.plant';
const PLANT_PURPOSE='purpose:paperchain:germination';

function plus(date, ms) {
  return new Date(Date.parse(date) + ms).toISOString();
}
function xml(value) {
  return String(value)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&apos;");
}
function exactStrings(value, expected) {
  return Array.isArray(value) &&
    value.length===expected.length &&
    [...value].sort().every((entry,index)=>entry===expected[index]);
}
async function loadFatherhandWitness(path, manifest, seedWitness) {
  if(typeof path!=='string' || path.length===0) throw new Error('FATHERHAND_WITNESS_REQUIRED');
  if(!isAbsolute(path)) throw new Error('FATHERHAND_WITNESS_PATH_NOT_ABSOLUTE');
  const info=await lstat(path);
  if(!info.isFile() || info.isSymbolicLink() || info.size===0 || info.size>262144)
    throw new Error('FATHERHAND_WITNESS_NOT_BOUNDED_REGULAR_FILE');
  const bytes=await readFile(path);
  let authority;
  try{authority=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('INVALID_FATHERHAND_WITNESS_JSON');}
  const expectedScope=[manifest.seed_id,seedWitness.crossing_id].sort();
  if(authority.schema!==FATHERHAND_SCHEMA ||
     authority.seedId!==manifest.seed_id ||
     authority.heldCrossingId!==seedWitness.crossing_id ||
     authority.capacityState!=='valid')
    throw new Error('FATHERHAND_WITNESS_BINDING_INVALID');
  const required=authority.requiredAct;
  if(!required || required.capability!==PLANT_CAPABILITY ||
     required.purposeId!==PLANT_PURPOSE ||
     !exactStrings(required.scopeRefs,expectedScope))
    throw new Error('FATHERHAND_REQUIRED_ACT_MISMATCH');
  const validation=authority.validation;
  if(!validation || validation.schema!==FATHERHAND_RECEIPT_SCHEMA ||
     validation.result!=='valid' ||
     !Array.isArray(validation.failures) || validation.failures.length!==0 ||
     !Array.isArray(validation.uncertainties) || validation.uncertainties.length!==0 ||
     validation.evaluatorVersion!=='fatherhand-grant-validator/v0.1' ||
     typeof validation.terminalGrantId!=='string' || validation.terminalGrantId.length===0 ||
     typeof validation.fatherhandId!=='string' || validation.fatherhandId.length===0)
    throw new Error('FATHERHAND_CAPACITY_NOT_VALID');
  if(!validation.required ||
     validation.required.capability!==PLANT_CAPABILITY ||
     validation.required.purposeId!==PLANT_PURPOSE ||
     !exactStrings(validation.required.scopeRefs,expectedScope))
    throw new Error('FATHERHAND_VALIDATION_SCOPE_MISMATCH');
  return {
    value:authority,
    bytes,
    sha256:sha256Hex(bytes),
    terminalGrantId:validation.terminalGrantId,
    fatherhandId:validation.fatherhandId,
    evaluatorVersion:validation.evaluatorVersion,
  };
}
async function destinationProcess(request) {
  const entry=fileURLToPath(new URL('./material-delivery.ts',import.meta.url));
  return new Promise((ok,fail)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',entry],{stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',p=>{stdout+=p;}); child.stderr.on('data',p=>{stderr+=p;});
    child.once('error',fail);
    child.once('close',code=>{
      if(code!==0){fail(new Error('DESTINATION_PROCESS_FAILED:'+stderr));return;}
      try{ok(JSON.parse(stdout));}catch{fail(new Error('INVALID_DESTINATION_RESULT'));}
    });
    child.stdin.end(JSON.stringify(request));
  });
}
function seedlingSvg(manifest, parentCrossingId) {
  const seed=manifest.seed_id;
  const source=manifest.source_artifacts?.find(x=>x.role==='original-manga-page');
  if(!source || typeof source.sha256!=='string') throw new Error('SEED_SOURCE_IMAGE_REQUIRED');
  const shortSeed=seed.split(':').at(-1).slice(0,16);
  const shortSource=source.sha256.slice(0,16);
  const shortParent=parentCrossingId.split(':').at(-1).slice(0,16);
  const title=xml(manifest.title);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
<rect width="1200" height="1600" fill="#f4f1e8"/>
<rect x="42" y="42" width="1116" height="1516" rx="28" fill="none" stroke="#101010" stroke-width="10"/>
<circle cx="600" cy="470" r="260" fill="none" stroke="#101010" stroke-width="18"/>
<circle cx="600" cy="470" r="155" fill="none" stroke="#101010" stroke-width="8"/>
<path d="M600 725 C600 860 505 905 405 995 M600 725 C600 875 600 960 600 1105 M600 725 C600 860 695 905 795 995" fill="none" stroke="#101010" stroke-width="22" stroke-linecap="round"/>
<path d="M405 995 C335 1075 300 1150 270 1260 M405 995 C430 1100 400 1200 380 1325 M600 1105 C550 1200 540 1280 520 1390 M600 1105 C650 1200 660 1280 680 1390 M795 995 C770 1100 800 1200 820 1325 M795 995 C865 1075 900 1150 930 1260" fill="none" stroke="#101010" stroke-width="13" stroke-linecap="round"/>
<path d="M600 470 C565 415 520 380 470 350 M600 470 C640 400 690 360 745 330 M600 470 L600 285" fill="none" stroke="#101010" stroke-width="15" stroke-linecap="round"/>
<circle cx="600" cy="265" r="28" fill="#101010"/>
<text x="600" y="120" text-anchor="middle" font-family="serif" font-size="54" font-weight="700">PAPERCHAIN / GERMINATION 002</text>
<text x="600" y="190" text-anchor="middle" font-family="monospace" font-size="26">PLANTED DESCENDANT — NOT THE ANCESTOR</text>
<text x="600" y="1480" text-anchor="middle" font-family="serif" font-size="34">${title}</text>
<text x="600" y="1525" text-anchor="middle" font-family="monospace" font-size="20">seed ${shortSeed} · source ${shortSource} · parent ${shortParent}</text>
</svg>\n`,'utf8');
}

export async function plantPaperchain(seedRoot, outputRoot, consent, fatherhandPath, createdAt=new Date().toISOString()) {
  if(consent!=='PLANT') throw new Error('EXPLICIT_PLANT_REQUIRED');
  if(!fatherhandPath) throw new Error('FATHERHAND_WITNESS_REQUIRED');
  if(!isAbsolute(seedRoot)||!isAbsolute(outputRoot)||!isAbsolute(fatherhandPath))
    throw new Error('ABSOLUTE_PATHS_REQUIRED');
  if(!Number.isFinite(Date.parse(createdAt))) throw new Error('INVALID_CREATION_TIME');
  try{await lstat(outputRoot);throw new Error('OUTPUT_ROOT_ALREADY_EXISTS');}
  catch(error){if(error.code!=='ENOENT')throw error;}

  const witness=JSON.parse(await readFile(join(seedRoot,'witness.json'),'utf8'));
  const carrier=JSON.parse(await readFile(join(seedRoot,'seed.carrier.json'),'utf8'));
  const manifestBytes=await readFile(join(seedRoot,'seed-manifest.json'));
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  if(manifest.schema!=='lemonpress.paperchain-seed/v0') throw new Error('INVALID_SEED_MANIFEST');
  if(witness.seed_id!==manifest.seed_id || witness.seed_manifest_sha256!==sha256Hex(manifestBytes))
    throw new Error('SEED_WITNESS_MISMATCH');
  if(carrier.crossing?.crossing_id!==witness.crossing_id || !(await verifyCrossingEnvelope(carrier.crossing)))
    throw new Error('INVALID_HELD_PARENT_CROSSING');

  const seedReceiver=await LocalReceiver.open(join(seedRoot,'receiver'));
  const held=seedReceiver.getDispositionReceipt(witness.crossing_id);
  const custody=seedReceiver.getPayloadCustodyReceipt(witness.crossing_id);
  if(!held || held.kind!=='R3_HOLD' || !custody || !(await verifyReceipt(held)) || !(await verifyReceipt(custody)) ||
     custody.extensions?.local_receiver?.payload_custody?.sha256!==sha256Hex(manifestBytes) ||
     custody.extensions?.local_receiver?.payload_custody?.retained!==true)
    throw new Error('PARENT_NOT_VERIFIED_HELD_SEED');

  const fatherhand=await loadFatherhandWitness(fatherhandPath,manifest,witness);
  const childBytes=seedlingSvg(manifest,witness.crossing_id);
  if(childBytes.length===0 || childBytes.length>65536) throw new Error('CHILD_BYTES_OUT_OF_CUSTODY_BOUND');
  const childHash=sha256Hex(childBytes);
  const plantCrossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0', protocol_version:'0',
    source_particular:manifest.seed_id,
    source_world:'world:paperchain/seedbank',
    source_history_head:'sha256:'+witness.seed_manifest_sha256,
    parents:[witness.crossing_id],
    declared_kind:'PAPERCHAIN_PLANTING',
    payload_refs:[{address:'sha256:'+witness.seed_manifest_sha256,role:'held-seed-manifest',media_type:'application/json'}],
    requested_effect:{kind:'explicit-local-plant',authority:'receiver-local'},
    capability_ref:'sha256:'+fatherhand.sha256,
    privacy_policy:null,audience_policy:null,
    return_address:'return:paperchain/seed-vault',
    created_at:createdAt,
    extensions:{
      paperchain:{consent:'PLANT',held_parent:witness.crossing_id,seed_id:manifest.seed_id},
      fatherhand_capacity:{
        schema:FATHERHAND_SCHEMA,
        witness_sha256:fatherhand.sha256,
        fatherhand_id:fatherhand.fatherhandId,
        terminal_grant_id:fatherhand.terminalGrantId,
        evaluator_version:fatherhand.evaluatorVersion,
        required_act:{
          capability:PLANT_CAPABILITY,
          scope_refs:[manifest.seed_id,witness.crossing_id].sort(),
          purpose_id:PLANT_PURPOSE,
        },
        inherited_authority:false,
      },
    },
  },await generateP256KeyPair());

  await mkdir(outputRoot,{recursive:true});
  const fatherhandCopy=join(outputRoot,'fatherhand-plant-witness.json');
  await writeFile(fatherhandCopy,fatherhand.bytes);
  const gardenRoot=join(outputRoot,'garden');
  const garden=await LocalReceiver.create(gardenRoot,{
    world_id:'world:paperchain/garden',
    receiver_particular:'particular:paperchain/gardener',
    contract_ref:'contract:paperchain/explicit-plant-v0',
  });
  const receive=await garden.receive(plantCrossing,plus(createdAt,1000));
  const admit=await garden.dispose(plantCrossing.crossing_id,'ADMIT',plus(createdAt,2000),{
    admit_effect:'paperchain-explicit-plant',
    descendant_refs:['sha256:'+childHash],
  });
  if(!(await verifyReceipt(receive)) || !(await verifyReceipt(admit)) || admit.kind!=='R3_ADMIT')
    throw new Error('PLANT_ADMISSION_FAILED');

  const lens=sealFieldLens({
    schema:'relatte.field-lens/v0',
    world_id:'world:paperchain/garden',
    title:'Paperchain Germination Lens',
    channels:[{name:'continuation',weights:{admitted_receipts:1,admitted_descendants:1}}],
    created_at:plus(createdAt,3000),
    laws:['LENS != HISTORY','LOCAL WEIGHT != UNIVERSAL VALUE'],
  });
  const field=await projectField({lens,admitted_receipts:[admit]});
  const uptake=await createCulturalUptake({
    ancestor_crossing:plantCrossing,
    admitted_receipt:admit,
    field_projection:field,
    world_id:'world:paperchain/garden',
    local_particular:'particular:paperchain/gardener',
    variation:{
      preserved:['seed identity','source image digest','attributable parent crossing','Fatherhand capacity witness digest'],
      varied:['held seed becomes an explicitly planted local occurrence'],
      introduced:['deterministic vector seedling descendant','fresh descendant signing key'],
      retired:['assumption that HOLD or capacity evidence alone authorizes germination'],
    },
    note:'Literal PLANT plus bounded Fatherhand capacity evidence preceded receiver-local admission and reproduction.',
    created_at:plus(createdAt,4000),
  });
  const descendant=await sealCrossingEnvelope(buildCulturalDescendantDraft({
    uptake,
    descendant_payload_ref:{address:'sha256:'+childHash,media_type:'image/svg+xml'},
    return_address:'return:paperchain/seedling-001',
    created_at:plus(createdAt,5000),
  }),await generateP256KeyPair());
  if(!(await verifyCulturalDescendant({
    ancestor_crossing:plantCrossing,
    admitted_receipt:admit,
    field_projection:field,
    uptake,
    descendant_crossing:descendant,
  }))) throw new Error('DESCENDANT_LINEAGE_FAILED');

  const childPath=join(outputRoot,'seedling-001.svg');
  await writeFile(childPath,childBytes);
  const nurseryRoot=join(outputRoot,'nursery');
  const nursery=await LocalReceiver.create(nurseryRoot,{
    world_id:'world:paperchain/nursery',
    receiver_particular:'particular:paperchain/nursery-inbox',
    contract_ref:'contract:paperchain/nursery-hold-v0',
  });
  await nursery.receive(descendant,plus(createdAt,6000));
  await nursery.dispose(descendant.crossing_id,'HOLD',plus(createdAt,7000));
  const childCarrierPath=join(outputRoot,'seedling.carrier.json');
  await writeFile(childCarrierPath,JSON.stringify({
    schema:'webz.material-carrier/v0',crossing:descendant,payload_base64:childBytes.toString('base64')
  })+'\n');
  const childCustody=await destinationProcess({
    schema:'relatte.material-delivery/v0',
    carrier_path:childCarrierPath,
    receiver_root:nurseryRoot,
    expected_crossing_id:descendant.crossing_id,
    created_at:plus(createdAt,8000),
  });
  if(childCustody.payload_sha256!==childHash || childCustody.retained!==true ||
     childCustody.receiver_disposition!=='R3_HOLD' || !(await verifyReceipt(childCustody.custody_receipt)))
    throw new Error('CHILD_CUSTODY_FAILED');

  const output={
    schema:'paperchain.germination-witness/v0',
    consent:'PLANT',
    held_seed_crossing:witness.crossing_id,
    fatherhand:{
      witness_path:fatherhandCopy,
      witness_sha256:fatherhand.sha256,
      fatherhand_id:fatherhand.fatherhandId,
      terminal_grant_id:fatherhand.terminalGrantId,
      capacity_state:'valid',
    },
    planting_crossing_id:plantCrossing.crossing_id,
    plant_admit_receipt_id:admit.receipt_id,
    field_projection_id:field.projection_id,
    uptake_id:uptake.uptake_id,
    child:{path:childPath,media_type:'image/svg+xml',sha256:childHash,byte_length:childBytes.length},
    descendant_crossing_id:descendant.crossing_id,
    nursery_receive_receipt_id:childCustody.receive_receipt.receipt_id,
    nursery_hold_receipt_id:childCustody.disposition_receipt.receipt_id,
    child_custody_receipt_id:childCustody.custody_receipt.receipt_id,
    nursery_cold_replay:childCustody.receiver_snapshot,
    laws:[
      'HOLD != PLANT',
      'CAPACITY != CONSENT',
      'CONSENT != CAPACITY',
      'VALIDATION != ACTIVATION',
      'FATHERHAND VALIDATION != RELATTE ADMISSION',
      'PLANT != INHERITED AUTHORITY',
      'DESCENDANT != ANCESTOR',
      'ANCESTRY != AUTHORITY',
      'ARRIVAL != ADMISSION',
    ],
    not_proven:[
      'full-source-image-byte-custody',
      'remote-network-crossing',
      'human-identity',
      'Fatherhand-witness-cryptographic-authenticity',
      'publication',
      'fitness-or-quality',
    ],
  };
  await Promise.all([
    writeFile(join(outputRoot,'planting-crossing.json'),JSON.stringify(plantCrossing,null,2)+'\n'),
    writeFile(join(outputRoot,'plant-admit-receipt.json'),JSON.stringify(admit,null,2)+'\n'),
    writeFile(join(outputRoot,'field-projection.json'),JSON.stringify(field,null,2)+'\n'),
    writeFile(join(outputRoot,'cultural-uptake.json'),JSON.stringify(uptake,null,2)+'\n'),
    writeFile(join(outputRoot,'descendant-crossing.json'),JSON.stringify(descendant,null,2)+'\n'),
    writeFile(join(outputRoot,'germination-witness.json'),JSON.stringify(output,null,2)+'\n'),
  ]);
  return output;
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [seedRootArg,outputArg,consent,fatherhandArg]=process.argv.slice(2);
  if(!seedRootArg||!outputArg||!fatherhandArg){
    process.stderr.write('Usage: node --experimental-strip-types scripts/paperchain-plant.mjs SEED_OUTPUT_DIR GERMINATION_OUTPUT_DIR PLANT FATHERHAND_WITNESS.json\n');
    process.exitCode=2;
  }else{
    plantPaperchain(resolve(seedRootArg),resolve(outputArg),consent,resolve(fatherhandArg))
      .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;});
  }
}
