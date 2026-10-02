import {
  readFile,
  writeFile,
} from 'node:fs/promises';

import {
  armorPortableCarry,
  dearmorPortableCarry,
  deserializePortableCarry,
  serializePortableCarry,
} from '../src/portable-carry.ts';

function usage(): never {
  throw new Error([
    'Usage:',
    '  npm run carry -- inspect <parcel.carry>',
    '  npm run carry -- armor <parcel.carry> [output.txt]',
    '  npm run carry -- dearmor <carry-text.txt> [output.carry]',
  ].join('\n'));
}

const [, , command, inputPath, outputPath] = process.argv;
if (!command || !inputPath) usage();

if (command === 'inspect') {
  const artifact = await deserializePortableCarry(
    await readFile(inputPath, 'utf8'),
  );
  const crossing = artifact.transport_bundle.crossing;
  console.log(JSON.stringify({
    schema: 'relatte.portable-carry-inspection/v0',
    portable_id: artifact.portable_id,
    media_type: artifact.media_type,
    created_at: artifact.created_at,
    crossing_id: crossing.crossing_id,
    declared_kind: crossing.declared_kind,
    source_world: crossing.source_world,
    return_address: crossing.return_address,
    encrypted_payload_id:
      artifact.transport_bundle.encrypted_payload.envelope_id,
    has_return_envelope: artifact.return_envelope !== null,
    return_envelope:
      artifact.return_envelope === null
        ? null
        : {
            return_envelope_id:
              artifact.return_envelope.return_envelope_id,
            return_world:
              artifact.return_envelope.return_world,
            recipient_world:
              artifact.return_envelope.recipient_world,
            reply_kind:
              artifact.return_envelope.reply_kind,
            max_replies:
              artifact.return_envelope.max_replies,
            expires_at:
              artifact.return_envelope.expires_at,
          },
    plaintext_decrypted: false,
    semantic_effect: 'none',
    laws: [
      'INSPECTION != DECRYPTION',
      'FILE != AUTHORITY',
      'PORTABLE != ADMITTED',
    ],
  }, null, 2));
  process.exit(0);
}

if (command === 'armor') {
  const artifact = await deserializePortableCarry(
    await readFile(inputPath, 'utf8'),
  );
  const armored = armorPortableCarry(artifact) + '\n';
  if (outputPath) {
    await writeFile(outputPath, armored, 'utf8');
  } else {
    process.stdout.write(armored);
  }
  process.exit(0);
}

if (command === 'dearmor') {
  const artifact = await dearmorPortableCarry(
    await readFile(inputPath, 'utf8'),
  );
  const serialized = serializePortableCarry(artifact) + '\n';
  if (outputPath) {
    await writeFile(outputPath, serialized, 'utf8');
  } else {
    process.stdout.write(serialized);
  }
  process.exit(0);
}

usage();
