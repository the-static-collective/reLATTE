#!/usr/bin/env node
/* Independent process signature and history verifier; never executes work. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyProof } from "./src/fabrication.mjs";
if(process.argv.length!==4)throw Error("Usage: node experiments/fabrication-crossing-013/verify-run.mjs EXISTING_PROOF.json EXTERNALLY_SELECTED_TRUST_PINS.json");
const proof=JSON.parse(readFileSync(resolve(process.argv[2]),"utf8"));
const pins=JSON.parse(readFileSync(resolve(process.argv[3]),"utf8"));
if(pins.source!=="EXPLICIT_EPHEMERAL_LAB_ANCHORS_NOT_EXTERNALLY_ATTESTED")
  throw Error("TRUST_PIN_SOURCE_NOT_DECLARED");
console.log(JSON.stringify(verifyProof(proof,pins),null,2));
