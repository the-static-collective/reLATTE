import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateForCanonicalization,
  validateTimestamp,
} from './canonical.ts';
import {
  P256_ALGORITHM,
  type P256KeyMaterial,
  verifyCrossingEnvelope,
} from './protocol.ts';

export const DID_BINDING_ID_DOMAIN = 'reLATTE-DidBinding-v0|';
export const DID_BINDING_RELATTE_SIGNATURE_DOMAIN = 'reLATTE-DidBinding-RelatteSignature-v0|';
export const DID_BINDING_DID_SIGNATURE_DOMAIN = 'reLATTE-DidBinding-DidSignature-v0|';

const ROOT_KEYS = [
  'schema',
  'binding_id',
  'particular_id',
  'crossing_id',
  'relatte_public_key',
  'did_uri',
  'did_verification_method_id',
  'did_public_key_jwk',
  'supersedes_binding_id',
  'created_at',
  'laws',
  'proofs',
] as const;

const PROOF_SET_KEYS = ['relatte', 'did'] as const;
const RELATTE_PROOF_KEYS = ['algorithm', 'signature'] as const;
const DID_PROOF_KEYS = ['algorithm', 'key_id', 'signature'] as const;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export interface DidBindingSigner {
  algorithm: string;
  keyId: string;
  sign(args: { data: Uint8Array }): Promise<Uint8Array>;
}

function asRecord(value: unknown, code = 'INVALID_DID_BINDING'): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function assertOnlyKeys(value: Record<string, any>, allowed: readonly string[], code: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!set.has(key)) throw new Error(code);
  }
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function canonicalBase64url(value: unknown, code: string): string {
  const text = nonEmpty(value, code);
  if (!BASE64URL_RE.test(text)) throw new Error(code);
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== text) throw new Error(code);
  return text;
}

function normalizePublicJwk(value: unknown): JsonWebKey {
  const jwk = asRecord(value, 'INVALID_DID_PUBLIC_KEY');
  if (Object.prototype.hasOwnProperty.call(jwk, 'd')) throw new Error('PRIVATE_KEY_MATERIAL');

  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return {
      kty: 'OKP',
      crv: 'Ed25519',
      x: canonicalBase64url(jwk.x, 'INVALID_DID_PUBLIC_KEY'),
    };
  }

  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return {
      kty: 'EC',
      crv: 'P-256',
      x: canonicalBase64url(jwk.x, 'INVALID_DID_PUBLIC_KEY'),
      y: canonicalBase64url(jwk.y, 'INVALID_DID_PUBLIC_KEY'),
    };
  }

  throw new Error('UNSUPPORTED_DID_PUBLIC_KEY');
}

function normalizeRelattePublicJwk(value: unknown): JsonWebKey {
  const jwk = asRecord(value, 'INVALID_RELATTE_PUBLIC_KEY');
  if (Object.prototype.hasOwnProperty.call(jwk, 'd')) throw new Error('PRIVATE_KEY_MATERIAL');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('INVALID_RELATTE_PUBLIC_KEY');
  return {
    kty: 'EC',
    crv: 'P-256',
    x: canonicalBase64url(jwk.x, 'INVALID_RELATTE_PUBLIC_KEY'),
    y: canonicalBase64url(jwk.y, 'INVALID_RELATTE_PUBLIC_KEY'),
  };
}

function stringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(code);
  }
  return [...value];
}

function optionalBindingId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return nonEmpty(value, 'INVALID_SUPERSEDES_BINDING_ID');
}

export function constructDidBindingIdentityBody(value: unknown): Record<string, unknown> {
  const binding = asRecord(value);
  validateForCanonicalization(binding);
  assertOnlyKeys(binding, ROOT_KEYS, 'UNEXPECTED_DID_BINDING_FIELD');
  if (binding.schema !== 'relatte.did-binding/v0') throw new Error('INVALID_DID_BINDING_SCHEMA');

  const didUri = nonEmpty(binding.did_uri, 'INVALID_DID_URI');
  if (!didUri.startsWith('did:')) throw new Error('INVALID_DID_URI');
  const verificationMethodId = nonEmpty(
    binding.did_verification_method_id,
    'INVALID_DID_VERIFICATION_METHOD_ID',
  );
  if (!verificationMethodId.startsWith(`${didUri}#`)) {
    throw new Error('DID_VERIFICATION_METHOD_OUTSIDE_DID');
  }

  const createdAt = nonEmpty(binding.created_at, 'INVALID_DID_BINDING_TIMESTAMP');
  validateTimestamp(createdAt);

  return {
    schema: 'relatte.did-binding/v0',
    particular_id: nonEmpty(binding.particular_id, 'INVALID_DID_BINDING_PARTICULAR'),
    crossing_id: nonEmpty(binding.crossing_id, 'INVALID_DID_BINDING_CROSSING'),
    relatte_public_key: normalizeRelattePublicJwk(binding.relatte_public_key),
    did_uri: didUri,
    did_verification_method_id: verificationMethodId,
    did_public_key_jwk: normalizePublicJwk(binding.did_public_key_jwk),
    supersedes_binding_id: optionalBindingId(binding.supersedes_binding_id),
    created_at: createdAt,
    laws: stringArray(binding.laws, 'INVALID_DID_BINDING_LAWS'),
  };
}

export function computeDidBindingId(value: unknown): string {
  const bytes = canonicalizeDomainValue(
    DID_BINDING_ID_DOMAIN,
    constructDidBindingIdentityBody(value),
  );
  return `relatte-did-binding-v0:${sha256Hex(bytes)}`;
}

function bindingSignatureBytes(domain: string, value: unknown): Buffer {
  const body = constructDidBindingIdentityBody(value);
  return canonicalizeDomainValue(domain, {
    binding_id: computeDidBindingId(value),
    ...body,
  });
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function equalCanonical(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

async function signRelatte(keys: P256KeyMaterial, data: Uint8Array): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new Uint8Array(data),
  );
  return base64url(signature);
}

async function verifyRelatteSignature(
  publicJwk: JsonWebKey,
  signatureText: string,
  data: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(canonicalBase64url(signatureText, 'INVALID_RELATTE_BINDING_SIGNATURE'), 'base64url'),
    new Uint8Array(data),
  );
}

async function verifyDidSignature(
  publicJwk: JsonWebKey,
  algorithm: string,
  signatureText: string,
  data: Uint8Array,
): Promise<boolean> {
  const signature = Buffer.from(
    canonicalBase64url(signatureText, 'INVALID_DID_BINDING_SIGNATURE'),
    'base64url',
  );

  if (publicJwk.kty === 'OKP' && publicJwk.crv === 'Ed25519') {
    if (algorithm !== 'EdDSA') return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify('Ed25519', key, signature, new Uint8Array(data));
  }

  if (publicJwk.kty === 'EC' && publicJwk.crv === 'P-256') {
    if (algorithm !== 'ES256') return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new Uint8Array(data),
    );
  }

  return false;
}

export async function createDidBinding(args: {
  crossing: unknown;
  particular_id: string;
  relatte_keys: P256KeyMaterial;
  did_uri: string;
  did_verification_method_id: string;
  did_public_key_jwk: JsonWebKey;
  did_signer: DidBindingSigner;
  created_at: string;
  supersedes_binding_id?: string | null;
}): Promise<Record<string, any>> {
  if (!(await verifyCrossingEnvelope(args.crossing))) throw new Error('INVALID_BOUND_CROSSING');
  const crossing = asRecord(args.crossing, 'INVALID_BOUND_CROSSING');
  const particularId = nonEmpty(args.particular_id, 'INVALID_DID_BINDING_PARTICULAR');

  if (crossing.source_particular !== particularId) throw new Error('BINDING_PARTICULAR_MISMATCH');
  if (!equalCanonical(
    normalizeRelattePublicJwk(crossing.signing?.public_key),
    normalizeRelattePublicJwk(args.relatte_keys.publicKeyJwk),
  )) {
    throw new Error('BINDING_RELATTE_KEY_MISMATCH');
  }

  const didSignerKeyId = nonEmpty(args.did_signer.keyId, 'INVALID_DID_SIGNER_KEY_ID');
  if (didSignerKeyId !== args.did_verification_method_id) {
    throw new Error('DID_SIGNER_METHOD_MISMATCH');
  }

  const draft: Record<string, any> = {
    schema: 'relatte.did-binding/v0',
    binding_id: 'pending',
    particular_id: particularId,
    crossing_id: crossing.crossing_id,
    relatte_public_key: normalizeRelattePublicJwk(args.relatte_keys.publicKeyJwk),
    did_uri: nonEmpty(args.did_uri, 'INVALID_DID_URI'),
    did_verification_method_id: nonEmpty(
      args.did_verification_method_id,
      'INVALID_DID_VERIFICATION_METHOD_ID',
    ),
    did_public_key_jwk: normalizePublicJwk(args.did_public_key_jwk),
    supersedes_binding_id: args.supersedes_binding_id ?? null,
    created_at: args.created_at,
    laws: [
      'PARTICULAR != DID',
      'DID != KEY',
      'KEY != HUMAN',
      'KEY ROTATION != HISTORY REWRITE',
      'DID RESOLUTION != HISTORICAL SIGNATURE VALIDITY',
    ],
    proofs: {
      relatte: {
        algorithm: P256_ALGORITHM,
        signature: 'pending',
      },
      did: {
        algorithm: nonEmpty(args.did_signer.algorithm, 'INVALID_DID_SIGNER_ALGORITHM'),
        key_id: didSignerKeyId,
        signature: 'pending',
      },
    },
  };

  draft.binding_id = computeDidBindingId(draft);
  draft.proofs.relatte.signature = await signRelatte(
    args.relatte_keys,
    bindingSignatureBytes(DID_BINDING_RELATTE_SIGNATURE_DOMAIN, draft),
  );
  draft.proofs.did.signature = base64url(await args.did_signer.sign({
    data: new Uint8Array(bindingSignatureBytes(DID_BINDING_DID_SIGNATURE_DOMAIN, draft)),
  }));

  return draft;
}

export async function verifyDidBindingForCrossing(
  bindingValue: unknown,
  crossingValue: unknown,
): Promise<boolean> {
  try {
    const binding = asRecord(bindingValue);
    const crossing = asRecord(crossingValue, 'INVALID_BOUND_CROSSING');
    const identity = constructDidBindingIdentityBody(binding);

    assertOnlyKeys(asRecord(binding.proofs, 'INVALID_DID_BINDING_PROOFS'), PROOF_SET_KEYS, 'UNEXPECTED_DID_BINDING_PROOF');
    const relatteProof = asRecord(binding.proofs.relatte, 'INVALID_RELATTE_BINDING_PROOF');
    const didProof = asRecord(binding.proofs.did, 'INVALID_DID_BINDING_PROOF');
    assertOnlyKeys(relatteProof, RELATTE_PROOF_KEYS, 'UNEXPECTED_RELATTE_BINDING_PROOF_FIELD');
    assertOnlyKeys(didProof, DID_PROOF_KEYS, 'UNEXPECTED_DID_BINDING_PROOF_FIELD');

    if (binding.binding_id !== computeDidBindingId(binding)) return false;
    if (!(await verifyCrossingEnvelope(crossing))) return false;
    if (crossing.crossing_id !== identity.crossing_id) return false;
    if (crossing.source_particular !== identity.particular_id) return false;
    if (!equalCanonical(
      normalizeRelattePublicJwk(crossing.signing?.public_key),
      identity.relatte_public_key,
    )) return false;

    if (relatteProof.algorithm !== P256_ALGORITHM) return false;
    if (didProof.key_id !== identity.did_verification_method_id) return false;

    const relatteOk = await verifyRelatteSignature(
      identity.relatte_public_key as JsonWebKey,
      nonEmpty(relatteProof.signature, 'INVALID_RELATTE_BINDING_SIGNATURE'),
      bindingSignatureBytes(DID_BINDING_RELATTE_SIGNATURE_DOMAIN, binding),
    );
    if (!relatteOk) return false;

    return verifyDidSignature(
      identity.did_public_key_jwk as JsonWebKey,
      nonEmpty(didProof.algorithm, 'INVALID_DID_BINDING_ALGORITHM'),
      nonEmpty(didProof.signature, 'INVALID_DID_BINDING_SIGNATURE'),
      bindingSignatureBytes(DID_BINDING_DID_SIGNATURE_DOMAIN, binding),
    );
  } catch {
    return false;
  }
}

export function verifyDidBindingAgainstDidDocument(
  bindingValue: unknown,
  didDocumentValue: unknown,
): boolean {
  try {
    const binding = constructDidBindingIdentityBody(bindingValue);
    const document = asRecord(didDocumentValue, 'INVALID_DID_DOCUMENT');
    if (document.id !== binding.did_uri || !Array.isArray(document.verificationMethod)) return false;

    const method = document.verificationMethod.find((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
      return (entry as Record<string, unknown>).id === binding.did_verification_method_id;
    });
    if (!method) return false;

    const methodRecord = asRecord(method, 'INVALID_DID_VERIFICATION_METHOD');
    if (methodRecord.controller !== binding.did_uri) return false;
    if (!Object.prototype.hasOwnProperty.call(methodRecord, 'publicKeyJwk')) return false;

    return equalCanonical(
      normalizePublicJwk(methodRecord.publicKeyJwk),
      binding.did_public_key_jwk,
    );
  } catch {
    return false;
  }
}
