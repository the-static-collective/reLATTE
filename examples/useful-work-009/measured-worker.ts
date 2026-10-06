import { executeNativeJob } from '../../src/useful_work/merkle_native/worker.ts';

if (!process.send) throw new Error('MEASURED_WORKER_REQUIRES_IPC');
process.on('message', message => {
  const m = message as { kind: string; job?: unknown };
  if (m.kind === 'stop') { process.disconnect!(); return; }
  if (m.kind !== 'run') throw new Error('INVALID_MEASURED_WORKER_MESSAGE');
  const result = executeNativeJob(m.job);
  process.send!({ kind: 'result', job: result.job, manifest: result.manifest, header: result.tree.header,
    artifact_base64: result.tree.bytes.toString('base64') });
});
process.send({ kind: 'ready' });
