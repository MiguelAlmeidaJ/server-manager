import { createServer, request as httpRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8080);
const origin = new URL(process.env.API_ORIGIN || 'http://127.0.0.1:3333');
const dist = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
    pathname = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const upstream = httpRequest({
      hostname: origin.hostname,
      port: origin.port || 80,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: req.headers.host || origin.host },
      timeout: 15_000,
    }, upstreamRes => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('API timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      if (!res.writableEnded) res.end('API unavailable');
    });
    req.pipe(upstream);
    return;
  }

  if (pathname.includes('\0') || pathname.includes('\\')) {
    res.writeHead(400).end('Bad Request');
    return;
  }

  const file = resolve(dist, '.' + pathname);
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let target = file;
  try {
    if (pathname === '/' || (await stat(file)).isDirectory()) target = resolve(dist, 'index.html');
    else if (!(await stat(file)).isFile()) throw new Error('Not a file');
  } catch {
    if (extname(pathname)) {
      res.writeHead(404).end('Not Found');
      return;
    }
    target = resolve(dist, 'index.html');
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404).end('Not Found');
  }
});
server.listen(port, host, () => console.log('ServerMap web listening on ' + host + ':' + port));
