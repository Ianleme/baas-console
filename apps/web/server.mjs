import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request as createHttpRequest } from 'node:http';
import { request as createHttpsRequest } from 'node:https';
import { extname, join, normalize } from 'node:path';

const root = new URL('./dist/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4173);
const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://api:3000');
if (!['http:', 'https:'].includes(apiOrigin.protocol)) {
  throw new Error('API_ORIGIN must use HTTP or HTTPS');
}

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);
const proxyOnlyHeaders = new Set(['origin', 'referer']);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2']
]);

function withoutHopByHopHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !hopByHopHeaders.has(name.toLowerCase()))
  );
}

function proxyApiRequest(request, response) {
  const target = new URL(request.url, apiOrigin);
  const requestFactory = target.protocol === 'https:' ? createHttpsRequest : createHttpRequest;
  const upstream = requestFactory(
    target,
    {
      method: request.method,
      headers: {
        ...Object.fromEntries(
          Object.entries(withoutHopByHopHeaders(request.headers)).filter(
            ([name]) => !proxyOnlyHeaders.has(name.toLowerCase())
          )
        ),
        host: target.host
      }
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        withoutHopByHopHeaders(upstreamResponse.headers)
      );
      upstreamResponse.pipe(response);
    }
  );

  upstream.on('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { 'content-type': 'application/problem+json; charset=utf-8' });
    response.end(
      JSON.stringify({
        type: 'about:blank',
        title: 'Bad Gateway',
        status: 502,
        code: 'API_UNAVAILABLE'
      })
    );
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
}

createServer(async (request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (
    request.url?.startsWith('/api/') ||
    request.url === '/docs' ||
    request.url?.startsWith('/docs/') ||
    request.url?.startsWith('/docs-json')
  ) {
    proxyApiRequest(request, response);
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
