import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw Object.assign(new Error('Invalid JSON object'), { status: 400 }); }
}
function routeId(pathname) {
  const match = pathname.match(/^\/api\/tasks\/([^/]+?)(\/archive)?$/);
  if (!match) return null;
  try { return { id: decodeURIComponent(match[1]), archive: Boolean(match[2]) }; } catch { return { id: '' }; }
}

export async function createServer({ store, repo }) {
  const clients = new Set();
  const send = (event, data) => {
    const block = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
    for (const client of clients) client.write(block);
  };
  const watcher = await store.watch(send);
  const ping = setInterval(() => { for (const client of clients) client.write(': ping\n\n'); }, 25_000);
  ping.unref();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    try {
      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { app: 'meanboard', repo, dir: store.key });
      if (req.method === 'GET' && pathname === '/api/tasks') return json(res, 200, { repo, link: store.link || null, tasks: await store.list() });
      if (req.method === 'POST' && pathname === '/api/tasks') return json(res, 201, await store.create(await body(req)));
      const target = routeId(pathname);
      if (target) {
        if (!store.validId(target.id)) return json(res, 400, { error: 'Invalid task id' });
        if (req.method === 'GET' && !target.archive) {
          const task = store.detail ? await store.detail(target.id) : (await store.list()).find(t => t.id === target.id);
          return task ? json(res, 200, task) : json(res, 404, { error: 'Task not found' });
        }
        if (req.method === 'PATCH' && !target.archive) {
          const patch = await body(req);
          if (patch.log !== undefined && (typeof patch.log !== 'string' || !patch.log.trim() || patch.log.length > 2000))
            return json(res, 400, { error: 'Log entry must be a non-empty string under 2000 chars' });
          const task = await store.update(target.id, patch);
          return task ? json(res, 200, task) : json(res, 404, { error: 'Task not found' });
        }
        if (req.method === 'POST' && target.archive) {
          return await store.archive(target.id) ? json(res, 200, { archived: true, id: target.id }) : json(res, 404, { error: 'Task not found' });
        }
      }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css', '/inter.woff2'].includes(pathname)) {
        const file = path.join(publicDir, pathname === '/' ? 'index.html' : pathname.slice(1));
        res.writeHead(200, { 'content-type': types[path.extname(file)] }); res.end(await fs.readFile(file)); return;
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      const bad = ['INVALID_TITLE', 'INVALID_STATUS', 'INVALID_ID', 'INVALID_PATCH'].includes(error.code);
      json(res, error.status || (bad ? 400 : 500), { error: bad || error.status ? error.message : 'Internal server error' });
    }
  });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true; watcher.close(); clearInterval(ping);
    for (const client of clients) client.end();
  };
  server.on('close', cleanup);
  // close() must end SSE clients first, or it waits on them forever.
  const close = server.close.bind(server);
  server.close = callback => { cleanup(); return close(callback); };
  return server;
}
