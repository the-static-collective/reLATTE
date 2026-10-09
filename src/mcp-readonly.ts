import { verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';

type Dict = Record<string, unknown>;

function object(value: unknown): Dict | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Dict : null;
}

function exactly(value: unknown, names: string[]): Dict | null {
  const record = object(value);
  if (!record || Object.keys(record).some((key) => !names.includes(key))) return null;
  return record;
}

const objectField = { type: 'object', description: 'Complete signed reLATTE v0 object; no private signing keys.' };

export const READ_ONLY_MCP_TOOLS = [
  {
    name: 'verify_crossing',
    title: 'Verify a reLATTE crossing',
    description: 'Cryptographically check the canonical ID and P-256 signature of one supplied crossing. Verification does not establish truth, signer identity, authorization, delivery, or local admission. Read-only; sends no data to any receiver.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['crossing'],
      properties: { crossing: objectField },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'verify_receipt',
    title: 'Verify a reLATTE receipt',
    description: 'Cryptographically check the canonical ID and P-256 signature of one supplied receipt. A valid signature is not proof of authority or of a real-world event. Read-only.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['receipt'],
      properties: { receipt: objectField },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'inspect_crossing_evidence',
    title: 'Inspect signed crossing and receipt evidence',
    description: 'Verify one crossing plus 1–16 supplied receipts, check same-crossing and same-receiver consistency, and report claimed local disposition without treating it as authorized fact. Does not read files or execute a crossing.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['crossing', 'receipts'],
      properties: {
        crossing: objectField,
        receipts: { type: 'array', minItems: 1, maxItems: 16, items: objectField },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

export function listReadOnlyMcpTools(): unknown[] {
  return READ_ONLY_MCP_TOOLS.map((tool) => structuredClone(tool));
}

const caution = 'Self-contained P-256 signature verification proves only integrity under the embedded public key. It does not authenticate the human, establish authority, confirm physical delivery, or admit the crossing.';

function result(value: Dict, isError = false): Dict {
  return {
    resultType: 'complete',
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

function invalidArguments(): Dict {
  return result({ verified: false, code: 'INVALID_TOOL_ARGUMENTS' }, true);
}

export async function callReadOnlyMcpTool(name: string, args: unknown): Promise<Dict> {
  if (name === 'verify_crossing') {
    const a = exactly(args, ['crossing']);
    if (!a || !object(a.crossing)) return invalidArguments();
    const valid = await verifyCrossingEnvelope(a.crossing);
    return result({
      verified: valid,
      crossing_id: valid ? (a.crossing as Dict).crossing_id : null,
      code: valid ? 'VALID_SIGNATURE' : 'INVALID_CROSSING',
      limitation: caution,
    });
  }

  if (name === 'verify_receipt') {
    const a = exactly(args, ['receipt']);
    if (!a || !object(a.receipt)) return invalidArguments();
    const valid = await verifyReceipt(a.receipt);
    return result({
      verified: valid,
      receipt_id: valid ? (a.receipt as Dict).receipt_id : null,
      crossing_id: valid ? (a.receipt as Dict).crossing_id : null,
      kind: valid ? (a.receipt as Dict).kind : null,
      semantic_effect: valid ? (a.receipt as Dict).semantic_effect : null,
      code: valid ? 'VALID_SIGNATURE' : 'INVALID_RECEIPT',
      limitation: caution,
    });
  }

  if (name === 'inspect_crossing_evidence') {
    const a = exactly(args, ['crossing', 'receipts']);
    if (!a || !object(a.crossing) || !Array.isArray(a.receipts) ||
        a.receipts.length < 1 || a.receipts.length > 16 ||
        a.receipts.some((r) => !object(r))) return invalidArguments();

    const crossing = a.crossing as Dict;
    if (!(await verifyCrossingEnvelope(crossing))) {
      return result({ verified: false, code: 'INVALID_CROSSING', limitation: caution });
    }
    const receipts = a.receipts as Dict[];
    for (const receipt of receipts) {
      if (!(await verifyReceipt(receipt))) {
        return result({ verified: false, code: 'INVALID_RECEIPT', limitation: caution });
      }
    }
    if (receipts.some((receipt) => receipt.crossing_id !== crossing.crossing_id)) {
      return result({ verified: false, code: 'CROSSING_RECEIPT_MISMATCH', limitation: caution });
    }
    const first = receipts[0];
    const key = JSON.stringify(object(first.signing)?.public_key);
    if (receipts.some((receipt) =>
      receipt.world_id !== first.world_id ||
      receipt.receiver_particular !== first.receiver_particular ||
      JSON.stringify(object(receipt.signing)?.public_key) !== key)) {
      return result({ verified: false, code: 'RECEIVER_RECEIPT_MISMATCH', limitation: caution });
    }
    const ids = receipts.map((receipt) => receipt.receipt_id);
    if (new Set(ids).size !== ids.length) {
      return result({ verified: false, code: 'DUPLICATE_RECEIPT', limitation: caution });
    }
    const receive = receipts.filter((receipt) => receipt.kind === 'RECEIVED');
    const dispositions = receipts.filter((receipt) =>
      ['R3_HOLD', 'R3_ADMIT', 'R3_REFUSE', 'R3_RETURN'].includes(String(receipt.kind)));
    if (receive.length !== 1 || receive[0].semantic_effect !== 'none' ||
        dispositions.length > 1 || receipts.length !== receive.length + dispositions.length ||
        dispositions.some((receipt) =>
          (receipt.kind === 'R3_HOLD' || receipt.kind === 'R3_REFUSE') &&
          receipt.semantic_effect !== 'none')) {
      return result({ verified: false, code: 'INCONSISTENT_RECEIPT_SEQUENCE', limitation: caution });
    }
    return result({
      verified: true,
      crossing_id: crossing.crossing_id,
      world_id_claim: first.world_id,
      receiver_particular_claim: first.receiver_particular,
      disposition_claim: dispositions.length ? String(dispositions[0].kind).slice(3) : 'RECEIVED',
      evidence_receipt_ids: ids,
      authority_verified: false,
      limitation: caution,
    });
  }
  return result({ code: 'UNKNOWN_TOOL', name }, true);
}

export async function dispatchReadOnlyMcpRequest(value: unknown): Promise<Dict> {
  const req = object(value);
  const id = req?.id;
  const validId = typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
  if (!req || req.jsonrpc !== '2.0' || !validId || typeof req.method !== 'string') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }
  if (req.method === 'server/discover') {
    return {
      jsonrpc: '2.0', id,
      result: {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'relatte-readonly', version: '0.0.2' } },
        instructions: 'Verify externally supplied signed crossing evidence. A verified signature is neither a human identity nor receiving-world authority. No writes or deliveries are provided.',
        ttlMs: 60000,
        cacheScope: 'public',
      },
    };
  }
  if (req.method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: {
      resultType: 'complete', tools: listReadOnlyMcpTools(), ttlMs: 60000, cacheScope: 'public',
    } };
  }
  if (req.method === 'tools/call') {
    const params = exactly(req.params, ['name', 'arguments', '_meta']);
    if (!params || typeof params.name !== 'string') {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params' } };
    }
    if (!READ_ONLY_MCP_TOOLS.some((tool) => tool.name === params.name)) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool' } };
    }
    return { jsonrpc: '2.0', id, result: await callReadOnlyMcpTool(params.name, params.arguments) };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}
