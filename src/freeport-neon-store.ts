/**
 * Storage adapter for FREEPORT 008's private Neon PostgreSQL review archive.
 * Call only AFTER original reLATTE signature and owner-key pin verification.
 * Caller supplies a trusted database client, never a browser-facing SQL role.
 */
import { canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import type { ReviewArchive, ReviewRecord } from './freeport-008.ts';

export interface FreeportSqlClient {
  query(sql: string, params: unknown[]): Promise<{ rows: Array<Record<string, any>> }>;
}
const COLUMNS = [
  'crossing_id','source_world','destination_world','source_key_fingerprint',
  'payload_sha256','payload_base64','crossing_envelope','response_bundle','disposition',
] as const;

function comparable(record: ReviewRecord): Record<string, unknown> {
  return {
    crossing_id:record.crossing_id,source_world:record.source_world,
    destination_world:record.destination_world,source_key_fingerprint:record.source_key_fingerprint,
    payload_sha256:record.payload_sha256,payload_base64:record.payload_base64,
    crossing_envelope:record.crossing,response_bundle:record.response_bundle,
    disposition:record.disposition,
  };
}
function digest(value: Record<string,unknown>): string {
  return sha256Hex(canonicalizeDomainValue('FREEPORT-008-SavedReview-v1|',value));
}

export class NeonFreeportReviewArchive implements ReviewArchive {
  private readonly db: FreeportSqlClient;
  constructor(db:FreeportSqlClient) { this.db = db; }
  async saveReview(record: ReviewRecord): Promise<void> {
    const data=comparable(record);
    const values=COLUMNS.map(key=>data[key]);
    const insert=await this.db.query(
      `INSERT INTO freeport.relatte_review_records (${COLUMNS.join(',')})
       VALUES (${COLUMNS.map((_,i)=>'$'+(i+1)).join(',')})
       ON CONFLICT (crossing_id) DO NOTHING
       RETURNING crossing_id`,values,
    );
    if (insert.rows.length===1) return;
    // Never reinterpret a conflicting history as successful idempotence.
    const prior=await this.db.query(
      `SELECT ${COLUMNS.join(',')} FROM freeport.relatte_review_records
       WHERE crossing_id=$1`,[record.crossing_id],
    );
    if (prior.rows.length!==1 || digest(prior.rows[0])!==digest(data)) {
      throw Error('FREEPORT_DIVERGENT_CROSSING_REPLAY');
    }
  }
}
