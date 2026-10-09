import { handleMcpVercelRequest } from '../src/mcp-vercel.ts';

// Deployment only after an OAuth issuer, JWKS and verified HTTPS domain exist.
export default {
  fetch(request: Request): Promise<Response> {
    return handleMcpVercelRequest(request, 'mcp');
  },
};
