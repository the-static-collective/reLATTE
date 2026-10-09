import { createLocalReadOnlyMcpServer } from '../src/mcp-local-http.ts';

const port = Number(process.env.RELATTE_MCP_PORT ?? '8787');
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('INVALID_RELATTE_MCP_PORT');
}
const server = createLocalReadOnlyMcpServer({
  stagingBearerToken: process.env.RELATTE_MCP_STAGING_TOKEN,
});
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('INVALID_LISTEN_ADDRESS');
  process.stdout.write('reLATTE local read-only MCP listening at http://127.0.0.1:' + address.port + '/mcp\n');
});
