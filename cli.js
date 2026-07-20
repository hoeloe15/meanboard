#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { boardReadme } from './lib/board-readme.js';
import { createServer } from './lib/server.js';
import { listTasks, STATUSES } from './lib/store.js';

function options(argv) {
  const out = { command: null, port: 4949, dir: './.board', open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'init' && !out.command) out.command = 'init';
    else if (arg === '--no-open') out.open = false;
    else if (arg === '--port' && argv[i + 1]) out.port = Number(argv[++i]);
    else if (arg === '--dir' && argv[i + 1]) out.dir = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  return out;
}

async function init(cwd) {
  const dir = path.join(cwd, '.board');
  await fs.mkdir(dir, { recursive: true });
  try { await fs.writeFile(path.join(dir, 'README.md'), boardReadme, { flag: 'wx' }); console.log('Created .board/README.md'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; console.log('.board/README.md already exists'); }
}

function autoOpen(url) {
  const candidates = process.env.BROWSER ? [[process.env.BROWSER, [url]]] : [];
  candidates.push(['xdg-open', [url]], ['open', [url]], ['cmd.exe', ['/c', 'start', '', url]]);
  const attempt = i => {
    if (i >= candidates.length) return;
    const child = spawn(candidates[i][0], candidates[i][1], { detached: true, stdio: 'ignore' });
    child.once('error', () => attempt(i + 1)); child.once('spawn', () => child.unref());
  };
  attempt(0);
}

async function main() {
  let opts;
  try { opts = options(process.argv.slice(2)); } catch (error) { console.error(`meanboard: ${error.message}`); process.exitCode = 1; return; }
  const cwd = process.cwd();
  if (opts.command === 'init') return init(cwd);
  const boardDir = path.resolve(cwd, opts.dir);
  try { if (!(await fs.stat(boardDir)).isDirectory()) throw new Error(); }
  catch { console.error('No board found. Run `meanboard init` first.'); process.exitCode = 1; return; }
  const repo = path.basename(cwd);
  const tasks = await listTasks(boardDir);
  const counts = Object.fromEntries(STATUSES.map(s => [s, tasks.filter(t => t.status === s).length]));
  const server = await createServer({ boardDir, repo });
  const listen = (port, triesLeft) => {
    server.removeAllListeners('listening');
    server.once('error', async error => {
      if (error.code !== 'EADDRINUSE') { console.error(`meanboard: ${error.message}`); server.close(); process.exitCode = 1; return; }
      if (await isSameBoard(port, boardDir)) {
        const url = `http://127.0.0.1:${port}`;
        console.log(`Board for ${repo} is already running — ${url}`);
        if (opts.open) autoOpen(url);
        server.close(); return;
      }
      if (triesLeft > 0) return listen(port + 1, triesLeft - 1);
      console.error(`meanboard: no free port in ${opts.port}-${port}; pick one with --port <n>`);
      server.close(); process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      if (port !== opts.port) console.log(`Port ${opts.port} was taken by something else — using ${port}.`);
      console.log(`${repo} — ${url}`);
      console.log(STATUSES.map(s => `${s}: ${counts[s]}`).join(' · '));
      if (opts.open) autoOpen(url);
    });
  };
  listen(opts.port, 20);
}

async function isSameBoard(port, boardDir) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return false;
    const health = await res.json();
    return health.app === 'meanboard' && health.dir === boardDir;
  } catch { return false; }
}

main().catch(error => { console.error(`meanboard: ${error.message}`); process.exitCode = 1; });
