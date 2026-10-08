function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function rconSeedSucceeded(response) {
  return /seed\s*:/i.test(String(response));
}

export async function waitForServerBlock(rcon, pos, block, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await rcon.send(
      'execute if block ' + pos.x + ' ' + pos.y + ' ' + pos.z + ' ' +
      block + ' run seed'
    );
    if (rconSeedSucceeded(response)) return response;
    await sleep(100);
  }
  throw new Error(
    'WORLDBUILDER_SERVER_BLOCK_NOT_OBSERVED:' +
    pos.x + ',' + pos.y + ',' + pos.z + ':' + block
  );
}

export async function waitForServerEntity(rcon, op, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await rcon.send(
      'execute positioned ' + op.at.x + ' ' + op.at.y + ' ' + op.at.z +
      ' if entity @e[type=' + op.entity + ',distance=..3] run seed'
    );
    if (rconSeedSucceeded(response)) return response;
    await sleep(100);
  }
  throw new Error('WORLDBUILDER_SERVER_ENTITY_NOT_OBSERVED:' + op.entity);
}

export async function verifyOperationEffect(rcon, op) {
  if (op.kind === 'fill') {
    await waitForServerBlock(rcon, op.from, op.block);
    await waitForServerBlock(rcon, op.to, op.block);
    return;
  }
  if (op.kind === 'setblock') {
    await waitForServerBlock(rcon, op.at, op.block);
    return;
  }
  await waitForServerEntity(rcon, op);
}
