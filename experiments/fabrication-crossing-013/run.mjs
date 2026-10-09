#!/usr/bin/env node
/* Explicit local three-node simulation. Does not contact any printer or web. */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { simulate } from "./src/fabrication.mjs";

if(process.argv.length!==4)throw Error("Usage: node experiments/fabrication-crossing-013/run.mjs STATIC_OS_REQUEST.json FRESH_OUTPUT_DIR");
const original=JSON.parse(readFileSync(process.argv[2],"utf8"));
const output=resolve(process.argv[3]);
if(existsSync(output))throw Error("OCCURRENCE_EXISTS_NO_AUTORETRY");
mkdirSync(output,{recursive:true,mode:0o700});
const proof=simulate(original);
writeFileSync(resolve(output,"proof.json"),JSON.stringify(proof,null,2)+"\n",{flag:"wx",mode:0o600});
writeFileSync(resolve(output,"trust-pins.json"),JSON.stringify({
  source:"EXPLICIT_EPHEMERAL_LAB_ANCHORS_NOT_EXTERNALLY_ATTESTED",
  worldAnchors:proof.source_owner_world_anchors,
  decisionKeys:proof.externally_pin_decision_keys,
},null,2)+"\n",{flag:"wx",mode:0o600});
console.log(JSON.stringify({status:"THREE_SIMULATED_NATIVE_RELATTE_OWNER_WORLDS",
  proof_id:proof.proof_id,signed_decisions:proof.decisions.length,
  signed_world_histories:proof.signed_world_histories.length,
  stale_grants_restored:0,physical_parts:0,transmissions:0},null,2));
