export const SOURCE_SHA256: string;
export const RETURN_CROSSING: string;
export const RETURN_RECEIPT: string;
export const PARENT_CROSSING: string;
export const PACKET_SHA256: string;
export const PARENT_PACKET_SHA256: string;
export interface CustodyResult {
  schema: string;
  source_sha256: string;
  original_signed_004_crossing: string;
  original_signed_005_crossing: string;
  observed_prior_and_next: { A: number[]; B: number[] };
  all_original_signatures_and_source_bytes_verified: true;
  admission: false;
  physical_actuation: false;
  administrative_independence_verified: false;
  disposition: 'HOLD';
}
export function verifyExistingCustodyBytes(raw:Buffer):Promise<CustodyResult>;
export function compareRepositoryCopies(primaryBytes:Buffer,peerBytes:Buffer):Promise<CustodyResult>;
export function verifyPath(path:string):Promise<CustodyResult>;
