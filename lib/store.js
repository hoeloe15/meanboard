import { promises as fs, watch as fsWatch } from 'node:fs';
import path from 'node:path';

export const STATUSES = ['draft', 'open', 'in-progress', 'review', 'done'];
export const validStatus = status => STATUSES.includes(status);
export const validId = id => typeof id === 'string' && id.length > 0 &&
  id !== 'README' && !id.includes('..') && !/[\\/\0]/.test(id);

const eolOf = text => text.includes('\r\n') ? '\r\n' : '\n';
const frontmatter = text => {
  const open = text.match(/^---(\r?\n)/);
  if (!open) return null;
  const start = open[0].length;
  const close = /^(---)[ \t]*(?:\r?\n|$)/m;
  const match = close.exec(text.slice(start));
  if (!match) return null;
  const closeStart = start + match.index;
  return { start, closeStart, end: closeStart + match[0].length,
    raw: text.slice(start, closeStart) };
};

export function parseTask(text, filename = 'task.md') {
  const fm = frontmatter(text);
  const meta = {};
  if (fm) for (const line of fm.raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match && !(match[1] in meta)) meta[match[1]] = match[2].trim();
  }
  const contentAt = fm?.end ?? 0;
  const content = text.slice(contentAt);
  const heading = /^# (.*?)(?:\r?\n|$)/m.exec(content);
  const id = filename.replace(/\.md$/i, '');
  return { id, title: heading?.[1].trim() || id, status: meta.status || 'draft',
    created: meta.created || '', body: heading ? content.slice(heading.index + heading[0].length) : content };
}

export function serializeTask({ title, status = 'draft', created, body = '' }) {
  const stamp = created || localTimestamp();
  const tail = body ? `\n${body}` : '';
  return `---\nstatus: ${status}\ncreated: ${stamp}\n---\n# ${title}${tail}`;
}

export function localTimestamp(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function slugify(title) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/g, '') || 'task';
}

function setStatus(text, status) {
  const fm = frontmatter(text);
  const eol = eolOf(text);
  if (!fm) return `---${eol}status: ${status}${eol}---${eol}${text}`;
  const match = /^([ \t]*status[ \t]*:[ \t]*)[^\r\n]*(\r?\n|$)/m.exec(fm.raw);
  if (match) {
    const at = fm.start + match.index;
    return text.slice(0, at) + match[1] + status + match[2] + text.slice(at + match[0].length);
  }
  return text.slice(0, fm.start) + `status: ${status}${eol}` + text.slice(fm.start);
}

function setContent(text, patch, filename) {
  const parsed = parseTask(text, filename);
  const fm = frontmatter(text);
  const at = fm?.end ?? 0;
  const content = text.slice(at);
  const heading = /^# (.*?)(?:\r?\n|$)/m.exec(content);
  const eol = eolOf(text);
  const title = patch.title ?? parsed.title;
  const body = patch.body ?? parsed.body;
  const replacement = `# ${title}${eol}${body}`;
  if (!heading) return text.slice(0, at) + replacement;
  return text.slice(0, at) + content.slice(0, heading.index) + replacement;
}

export async function listTasks(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const names = entries.filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map(e => e.name).sort();
  const tasks = await Promise.all(names.map(async name => {
    try { return parseTask(await fs.readFile(path.join(dir, name), 'utf8'), name); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }));
  return tasks.filter(Boolean);
}

export async function createTask(dir, input) {
  if (!input?.title?.trim()) throw Object.assign(new Error('Title is required'), { code: 'INVALID_TITLE' });
  const status = input.status ?? 'draft';
  if (!validStatus(status)) throw Object.assign(new Error('Invalid status'), { code: 'INVALID_STATUS' });
  const base = slugify(input.title.trim());
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    try {
      await fs.writeFile(path.join(dir, `${id}.md`), serializeTask({ title: input.title.trim(), body: input.body || '', status }), { flag: 'wx' });
      return parseTask(await fs.readFile(path.join(dir, `${id}.md`), 'utf8'), `${id}.md`);
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}

export async function updateTask(dir, id, patch) {
  if (!validId(id)) throw Object.assign(new Error('Invalid task id'), { code: 'INVALID_ID' });
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw Object.assign(new Error('Task update must be an object'), { code: 'INVALID_PATCH' });
  if (patch.status !== undefined && !validStatus(patch.status)) throw Object.assign(new Error('Invalid status'), { code: 'INVALID_STATUS' });
  const file = path.join(dir, `${id}.md`);
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (patch.status !== undefined) text = setStatus(text, patch.status);
  if (patch.title !== undefined || patch.body !== undefined) text = setContent(text, patch, `${id}.md`);
  await fs.writeFile(file, text);
  return parseTask(text, `${id}.md`);
}

export async function archiveTask(dir, id) {
  if (!validId(id)) throw Object.assign(new Error('Invalid task id'), { code: 'INVALID_ID' });
  const source = path.join(dir, `${id}.md`);
  await fs.mkdir(path.join(dir, 'archive'), { recursive: true });
  try { await fs.rename(source, path.join(dir, 'archive', `${id}.md`)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function watchTasks(dir, onEvent, debounce = 150) {
  let snapshot = new Map((await listTasks(dir)).map(t => [t.id, t.status]));
  let timer;
  const tick = async () => {
    try {
      const tasks = await listTasks(dir);
      const next = new Map(tasks.map(t => [t.id, t.status]));
      for (const task of tasks) if (task.status === 'review' && snapshot.get(task.id) !== 'review') onEvent('review', { id: task.id, title: task.title });
      snapshot = next;
      onEvent('change');
    } catch (error) { if (error.code !== 'ENOENT') console.error(`meanboard watch: ${error.message}`); }
  };
  const watcher = fsWatch(dir, () => { clearTimeout(timer); timer = setTimeout(tick, debounce); });
  return { close() { clearTimeout(timer); watcher.close(); } };
}
