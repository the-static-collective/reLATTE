/**
 * Dependency supply-chain gate for reLATTE's MCP adapter.
 *
 * Ensures the reviewed package.json and lockfile specify an exact,
 * integrity-addressed graph and cannot silently downgrade the patched
 * MCP OAuth client. This is a policy gate in addition to npm audit,
 * not a replacement for advisory scanning, artifact review, or sandboxing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

assert.equal(lock.lockfileVersion, 3, 'require current npm lockfile v3');
assert.equal(manifest.name, lock.name, 'lockfile must describe the correct project');
assert.equal(manifest.version, lock.version, 'lockfile project version mismatch');
assert.equal(manifest.private, true, 'experimental MCP package must remain private');

const root = lock.packages[''];
assert(root && typeof root === 'object', 'lockfile is missing root package');
for (const group of ['dependencies', 'devDependencies']) {
  assert.deepEqual(root[group], manifest[group], 'lockfile does not match ' + group);
  for (const [name, pinned] of Object.entries(manifest[group] ?? {})) {
    assert.match(String(pinned), /^\d+\.\d+\.\d+$/, name + ' must be an exact reviewed version');
    const resolved = lock.packages['node_modules/' + name];
    assert(resolved, name + ' must resolve to a lockfile package');
    assert.equal(resolved.version, pinned, name + ' lockfile version differs from manifest');
  }
}

const client = manifest.devDependencies['@modelcontextprotocol/client'];
const server = manifest.dependencies['@modelcontextprotocol/server'];
assert.equal(client, server, 'client and server SDKs must be upgraded in lockstep');
assert.equal(client?.split('.')[0], '2', 'MCP SDK major version must be intentionally reviewed');
const [major, minor, patch] = client.split('.').map(Number);
assert(major > 2 || (major === 2 && (minor > 3 || (minor === 3 && patch >= 1))),
  'MCP OAuth SDK version must be >= 2.3.1; earlier builds have known advisories');
assert(!Object.hasOwn(manifest.dependencies, '@modelcontextprotocol/client'),
  'OAuth test client must not be shipped as a runtime dependency');

let verifiedPackages = 0;
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!name) continue;
  assert(entry && typeof entry === 'object', 'invalid package entry: ' + name);
  assert.match(entry.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/,
    'missing sha512 package integrity: ' + name);
  const resolved = new URL(entry.resolved);
  assert.equal(resolved.protocol, 'https:', 'disallow non-HTTPS resolution: ' + name);
  assert.equal(resolved.hostname, 'registry.npmjs.org',
    'disallow unreviewed non-npm registry or Git sources: ' + name);
  verifiedPackages++;
}
assert(verifiedPackages > 0, 'empty dependency tree');
console.log('Dependency policy passed: ' + verifiedPackages +
  ' integrity-pinned packages; MCP SDK ' + client + '; lockfile matches manifest.');
