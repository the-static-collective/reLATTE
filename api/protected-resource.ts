import { handleMcpVercelRequest } from '../src/mcp-vercel.ts';

// Public OAuth protected-resource discovery does not expose private tokens.
export default {
  fetch(request: Request): Promise<Response> {
    return handleMcpVercelRequest(request, 'metadata');
  },
};
