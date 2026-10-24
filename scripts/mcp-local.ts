import { createLocalReadOnlyMcpServer } from '../src/mcp-local-http.ts';

const port = Number(process.env.RELATTE_MCP_PORT ?? '8787');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('INVALID_RELATTE_MCP_PORT');
}
const server = createLocalReadOnlyMcpServer();
server.listen(port, '127.0.0.1', () => {
  process.stdout.write('reLATTE local read-only MCP listening at http://127.0.0.1:' + port + '/mcp\n');
});
