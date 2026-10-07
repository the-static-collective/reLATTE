import {receiveMaterialDelivery} from '../src/material-delivery.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
async function main(): Promise<void> {
  const input=await readStdin();
  if (!input.trim() || Buffer.byteLength(input,'utf8') > 32768) throw new Error('DELIVERY_INPUT_REQUIRED_OR_OVERSIZED');
  const result=await receiveMaterialDelivery(JSON.parse(input));
  process.stdout.write(JSON.stringify(result)+'\n');
}
main().catch((error)=>{
  process.stderr.write(JSON.stringify({error:error instanceof Error ? error.message:'MATERIAL_DELIVERY_FAILED'})+'\n');
  process.exitCode=1;
});
