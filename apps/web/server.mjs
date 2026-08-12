import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('./dist/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4173);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.woff2', 'font/woff2']
]);

createServer(async (request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const requested = pathname === '/' ? 'app.html' : pathname === '/pay' ? 'pay.html' : pathname;
  const relative = normalize(decodeURIComponent(requested)).replace(/^[/\\]+/u, '');
  const file = join(root, relative);
  if (!file.startsWith(root)) {
    response.writeHead(404).end();
    return;
  }

  try {
    const metadata = await stat(file);
    if (!metadata.isFile()) throw new Error('NOT_A_FILE');
    response.writeHead(200, {
      'cache-control': relative.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'content-type': contentTypes.get(extname(file)) ?? 'application/octet-stream'
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '0.0.0.0');
