import { createHash } from 'node:crypto';

/**
 * BRiAR CONTINUATION 001 — opt-in human invitation to a signed reLATTE crossing.
 * Talks to upstream Briar Headless REST API on loopback only.
 * Does NOT implement Briar's cryptography, message sync, or a VPN transport.
 */

export interface BriarInvitation {
  schema: 'relatte.briar-human-invitation/v0';
  crossing_id: string;
  note: string;
  text: string;
}
export interface BriarHeadlessConfig {
  origin: string;
  token: string;
}
export interface BriarSendRequest {
  config: BriarHeadlessConfig;
  contactId: number;
  invitation: BriarInvitation;
  confirmation: string;
}
export interface BriarSubmission {
  status: 'submitted-to-local-briar';
  contact_id: number;
  crossing_id: string;
  remote_delivery: 'unknown';
  receive_receipt: 'not-established';
}

const ID_RE = /^relatte-crossing-v0:[0-9a-f]{64}$/;
const MAX_NOTE_CHARS = 240;
const MAX_MESSAGE_BYTES = 800;

function assertOrigin(origin: string): string {
  let value: URL;
  try { value = new URL(origin); } catch { throw new Error('BRIAR_INVALID_ORIGIN'); }
  // Strict loopback only; no host aliases, redirect credentials, path or userinfo.
  if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1'
    || !value.port || value.pathname !== '/' || value.search || value.hash
    || value.username || value.password) throw new Error('BRIAR_LOOPBACK_ONLY');
  return value.origin;
}
function assertContactId(id: number): void {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('BRIAR_INVALID_CONTACT');
}
function assertConfig(config: BriarHeadlessConfig): string {
  const origin = assertOrigin(config.origin);
  if (typeof config.token !== 'string' || !config.token.trim()
    || /[\r\n]/.test(config.token)) throw new Error('BRIAR_TOKEN_REQUIRED');
  return origin;
}
function bodyOf(crossingId: string, note: string): string {
  return [
    'Static Collective — crossing invitation',
    'ID: ' + crossingId,
    ...(note ? ['Note: ' + note] : []),
    'Invitation only. No attached content or admission is implied.',
  ].join('\n');
}

export function prepareBriarInvitation(crossingId: string, note = ''): BriarInvitation {
  if (typeof crossingId !== 'string' || !ID_RE.test(crossingId))
    throw new Error('BRIAR_INVALID_CROSSING_ID');
  if (typeof note !== 'string' || [...note].length > MAX_NOTE_CHARS
    || /[\r\n\u0000-\u001f]/.test(note))
    throw new Error('BRIAR_INVALID_NOTE');
  const text = bodyOf(crossingId, note);
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES)
    throw new Error('BRIAR_MESSAGE_TOO_LARGE');
  return {
    schema: 'relatte.briar-human-invitation/v0',
    crossing_id: crossingId,
    note,
    text,
  };
}

export function briarSendConfirmation(contactId: number, invitation: BriarInvitation): string {
  assertContactId(contactId);
  const validated = prepareBriarInvitation(invitation.crossing_id, invitation.note);
  if (invitation.schema !== validated.schema || invitation.text !== validated.text)
    throw new Error('BRIAR_INVITATION_TAMPERED');
  const shortDigest = createHash('sha256')
    .update(String(contactId) + '\0' + invitation.text)
    .digest('hex').slice(0, 12);
  return 'SEND ' + contactId + ' ' + shortDigest;
}

async function localRequest(
  config: BriarHeadlessConfig,
  path: string,
  method: 'GET' | 'POST',
  body?: object,
): Promise<Response> {
  const origin = assertConfig(config);
  let response: Response;
  try {
    response = await fetch(origin + path, {
      method,
      headers: {
        authorization: 'Bearer ' + config.token,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
  } catch {
    throw new Error('BRIAR_LOCAL_API_UNAVAILABLE');
  }
  if (!response.ok) throw new Error('BRIAR_LOCAL_API_REJECTED');
  return response;
}

/** Read-only preflight; contact metadata never enters returned receipts or logs. */
export async function listVerifiedBriarContacts(config: BriarHeadlessConfig):
  Promise<Array<{ contactId: number; verified: true }>> {
  const response = await localRequest(config, '/v1/contacts', 'GET');
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('BRIAR_INVALID_CONTACT_RESPONSE'); }
  if (!Array.isArray(data)) throw new Error('BRIAR_INVALID_CONTACT_RESPONSE');
  return data.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (item.verified === true && typeof item.contactId === 'number'
      && Number.isSafeInteger(item.contactId) && item.contactId > 0) {
      return [{ contactId: item.contactId, verified: true as const }];
    }
    return [];
  });
}

/** One opt-in send; no silent retry, automatic broadcasts or delivery claims. */
export async function submitBriarInvitation(request: BriarSendRequest): Promise<BriarSubmission> {
  assertContactId(request.contactId);
  const expected = briarSendConfirmation(request.contactId, request.invitation);
  if (request.confirmation !== expected) throw new Error('BRIAR_EXPLICIT_CONFIRMATION_REQUIRED');

  const contacts = await listVerifiedBriarContacts(request.config);
  if (!contacts.some((contact) => contact.contactId === request.contactId))
    throw new Error('BRIAR_VERIFIED_CONTACT_REQUIRED');

  // The text contains only the approved crossing identifier and user-supplied note.
  // No crossing payload, private keys or local history are transmitted here.
  await localRequest(
    request.config,
    '/v1/messages/' + request.contactId,
    'POST',
    { text: request.invitation.text },
  );
  return {
    status: 'submitted-to-local-briar',
    contact_id: request.contactId,
    crossing_id: request.invitation.crossing_id,
    remote_delivery: 'unknown',
    receive_receipt: 'not-established',
  };
}
