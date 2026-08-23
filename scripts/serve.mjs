import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = createServer(async (request, response) => {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
  try { const body = await readFile(file); response.writeHead(200, {'content-type':types[extname(file)] || 'application/octet-stream'}); response.end(body); }
  catch { response.writeHead(404); response.end('Not found'); }
});
const port = Number(process.env.KAACK_PORT || 4175);
server.listen(port, '127.0.0.1', () => console.log(`KAACK Cloud Builder demo: http://127.0.0.1:${port}`));
