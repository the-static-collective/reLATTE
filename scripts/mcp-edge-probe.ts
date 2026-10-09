/**
 * Public-metadata-only probe. No credentials or bearer tokens are read.
 *
 * Example after real HTTPS domain and external issuer are configured:
 *   RELATTE_MCP_RESOURCE=https://<owned-host>/mcp \
 *   RELATTE_OAUTH_ISSUER=https://<idp-host>/ \
 *   RELATTE_OAUTH_JWKS_URI=https://<idp-host>/.well-known/jwks.json \
 *   RELATTE_OAUTH_INTROSPECTION_URI=https://<idp-host>/introspect \
 *   RELATTE_OAUTH_SCOPE=relatte:verify npm run mcp:edge:probe
 *
 * A passing probe is NOT OAuth connection, real-user consent, TLS-chain
 * attestation, user verification, production deployment or publisher approval.
 */
import { evaluateEdgeReadiness } from '../src/mcp-edge-readiness.ts';

const input = {
  resource: process.env.RELATTE_MCP_RESOURCE ?? '',
  issuer: process.env.RELATTE_OAUTH_ISSUER ?? '',
  jwksUri: process.env.RELATTE_OAUTH_JWKS_URI ?? '',
  introspectionUri: process.env.RELATTE_OAUTH_INTROSPECTION_URI ?? '',
  scope: process.env.RELATTE_OAUTH_SCOPE ?? '',
};
const configured = Object.values(input).every(Boolean);
if (!configured) {
  process.stdout.write(JSON.stringify({
    readyForLiveOAuthTest: false, holds: ['real owned resource hostname',
      'OAuth issuer, JWKS, introspection endpoint and least-privileged scope'],
    deployed: false,
  }, null, 2) + '\n');
  process.exitCode = 2;
} else {
  try {
    const issuer = new URL(input.issuer);
    const origin = issuer.origin;
    const metadataLocation = process.env.RELATTE_OAUTH_METADATA_URI ??
      new URL('/.well-known/oauth-authorization-server', input.issuer).href;
    const authUri = new URL(metadataLocation);
    if (authUri.origin !== origin || authUri.protocol !== 'https:' ||
        authUri.username || authUri.password || authUri.search || authUri.hash) {
      throw Error('UNTRUSTED_ISSUER_METADATA_LOCATION');
    }
    const getDoc = async (uri: string): Promise<unknown> => {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(uri, {
          method: 'GET', redirect: 'error', cache: 'no-store',
          headers: { accept: 'application/json' }, signal: controller.signal,
        });
        if (response.status !== 200 ||
            !response.headers.get('content-type')?.includes('application/json') ||
            Number(response.headers.get('content-length') || 0) > 16384 ||
            !response.body) throw Error('METADATA_REJECTED');
        const reader = response.body.getReader();
        const parts = [];
        let total = 0;
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            total += item.value.byteLength;
            if (total > 16384) {
              await reader.cancel();
              throw Error('METADATA_TOO_LARGE');
            }
            parts.push(item.value);
          }
        } finally { reader.releaseLock(); }
        return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(
          Buffer.concat(parts.map(p => Buffer.from(p)))));
      } finally { clearTimeout(deadline); }
    };
    const [resourceDoc, authDoc] = await Promise.all([
      getDoc(new URL('/.well-known/oauth-protected-resource', input.resource).href),
      getDoc(metadataLocation),
    ]);
    const result = evaluateEdgeReadiness(input, resourceDoc, authDoc);
    process.stdout.write(JSON.stringify({
      ...result,
      note: 'Metadata-only observation; real identity, revocation and HTTPS client attestation remain unverified',
    }, null, 2) + '\n');
    if (!result.readyForLiveOAuthTest) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({
      readyForLiveOAuthTest: false,
      holds: ['Public resource or authorization metadata unavailable/untrusted'],
      deployed: 'not established by this probe',
    }, null, 2) + '\n');
    process.exitCode = 1;
  }
}
