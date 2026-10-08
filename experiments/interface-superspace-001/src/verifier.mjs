import { digest, verifySeal } from './receipts.mjs';
import { verifyCrossingEnvelope, verifyReceipt } from '../../../src/protocol.ts';
export function verifyExecution(plan, record) {
  verifySeal(record, 'execution_digest');
  if (record.route_id !== plan.route_id || record.plan_digest !== plan.plan_digest || record.execution_id === plan.route_id) throw new Error('PLAN_OCCURRENCE_CONFUSION');
  if (record.actual_relation_receipts.length !== record.particulars.length || record.native_particular_refs.length !== record.particulars.length + 1 || record.actual_interfaces_traversed.length !== record.particulars.length + 1) throw new Error('EXECUTION_LENGTH_MISMATCH');
  if (record.result === 'succeeded' && (record.actual_relation_receipts.length !== plan.relation_sequence.length || record.failures.length)) throw new Error('INCOMPLETE_EXECUTION');
  let prior = record.source;
  const ids = new Set([prior.particular_id]);
  for (let n=0; n<record.particulars.length; n++) {
    const child = record.particulars[n], receipt = record.actual_relation_receipts[n];
    verifySeal(receipt, 'receipt_digest');
    if (child.authority.length || ids.has(child.particular_id) || child.parent !== prior.particular_id || receipt.source_particular !== prior.particular_id || receipt.descendant_particular !== child.particular_id) throw new Error('PARTICULAR_ANCESTRY_OR_AUTHORITY');
    if (receipt.execution_id !== record.execution_id || receipt.relation_id !== plan.relation_sequence[n] || receipt.source_interface !== plan.interface_sequence[n] || receipt.destination_interface !== plan.interface_sequence[n+1] || child.interface_id !== receipt.destination_interface || record.actual_interfaces_traversed[n+1] !== child.interface_id) throw new Error('ACTUAL_ROUTE_MISMATCH');
    if (receipt.input_digest !== prior.content_digest || receipt.output_digest !== child.content_digest || receipt.native_ref !== child.native_ref || record.native_particular_refs[n+1] !== child.native_ref || child.transformation.relation_id !== receipt.relation_id) throw new Error('NATIVE_BINDING_MISMATCH');
    ids.add(child.particular_id); prior = child;
  }
  return true;
}
export async function verifyCrossing(artifact) {
  if (!artifact.crossing || !artifact.receipt || artifact.receipt.crossing_id !== artifact.crossing.crossing_id) return false;
  if (!await verifyCrossingEnvelope(artifact.crossing) || !await verifyReceipt(artifact.receipt)) return false;
  return artifact.crossing.payload_refs[0].address === 'sha256:' + (await import('../../../src/canonical.ts')).sha256Hex(artifact.bytes);
}
export function summary(record) { return { execution_id: record.execution_id, route_id: record.route_id, result: record.result, traversed: record.actual_interfaces_traversed.length, digest: digest(record), failures: record.failures }; }
