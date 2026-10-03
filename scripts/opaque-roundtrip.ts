import { runOpaqueOrganRoundTrip } from '../src/index.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const text = await readStdin();
  if (text.trim() === '') throw new Error('ROUNDTRIP_INPUT_REQUIRED');
  const request = JSON.parse(text);
  const result = await runOpaqueOrganRoundTrip(request);
  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : 'ROUNDTRIP_FAILED',
    }) + '\n',
  );
  process.exitCode = 1;
});
