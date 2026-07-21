import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  archiveTask, createTask, listTasks, parseTask, serializeTask,
  updateTask, validId, watchTasks
} from '../lib/store.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(process.cwd(), '.meanboard-test-'));
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  return dir;
}

test('serialize and parse round-trip title, status, created, and body', () => {
  const body = '\nContext with **bold**.\n\n- [ ] exact bytes\n';
  const text = serializeTask({ title:'Round trip', status:'open', created:'2026-07-20 14:02', body });
  assert.deepEqual(parseTask(text, 'round-trip.md'), {
    id:'round-trip', title:'Round trip', status:'open', created:'2026-07-20 14:02', body
  });
});

test('status-only update preserves odd frontmatter, CRLF, and body bytes', async t => {
  const dir = await fixture(t), file = path.join(dir, 'odd.md');
  const original = '---\r\nagent-note: keep: this\r\nstatus : open\r\ncustom_key:  yes  \r\n---\r\npreface\r\n# Odd task\r\nBody\r\n- [ ] exact\r\n';
  await fs.writeFile(file, original);
  const task = await updateTask(dir, 'odd', { status:'review' });
  const changed = await fs.readFile(file, 'utf8');
  assert.equal(changed, original.replace('status : open', 'status : review'));
  assert.equal(task.status, 'review');
  assert.equal(task.body, 'Body\r\n- [ ] exact\r\n');
  assert.match(changed, /agent-note: keep: this/);
});

test('missing frontmatter and H1 fall back safely', async t => {
  const dir = await fixture(t), raw = 'Loose notes\r\nwithout a heading\r\n';
  assert.deepEqual(parseTask(raw, 'loose.md'), {
    id:'loose', title:'loose', status:'draft', created:'', body:raw
  });
  await fs.writeFile(path.join(dir, 'loose.md'), raw);
  await updateTask(dir, 'loose', { status:'open' });
  const changed = await fs.readFile(path.join(dir, 'loose.md'), 'utf8');
  assert.equal(changed, `---\r\nstatus: open\r\n---\r\n${raw}`);
});

test('creation slugifies titles and resolves collisions', async t => {
  const dir = await fixture(t);
  const first = await createTask(dir, { title:'Crème brûlée & API!' });
  const second = await createTask(dir, { title:'Crème brûlée & API!' });
  assert.equal(first.id, 'creme-brulee-api');
  assert.equal(second.id, 'creme-brulee-api-2');
  assert.deepEqual(new Set((await listTasks(dir)).map(task => task.id)), new Set([first.id, second.id]));
});

test('direct disk transition into review emits a review event', async t => {
  const dir = await fixture(t), task = await createTask(dir, { title:'Agent edit', status:'open' });
  let watcher;
  t.after(() => watcher?.close());
  const review = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('review event timed out')), 2000);
    watchTasks(dir, (event, data) => {
      if (event === 'review') { clearTimeout(timeout); resolve(data); }
    }, 25).then(value => { watcher = value; }).catch(reject);
  });
  while (!watcher) await new Promise(resolve => setTimeout(resolve, 5));
  const file = path.join(dir, `${task.id}.md`), raw = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, raw.replace('status: open', 'status: review'));
  assert.deepEqual(await review, { id:task.id, title:'Agent edit' });
});

test('ids reject traversal and archive moves a task out of the board', async t => {
  for (const id of ['', '..', '../x', 'x/y', 'x\\y', 'bad\0id', 'README']) assert.equal(validId(id), false, id);
  assert.equal(validId('safe-task-2'), true);
  const dir = await fixture(t), task = await createTask(dir, { title:'Finished', status:'done' });
  assert.equal(await archiveTask(dir, task.id), true);
  assert.deepEqual(await listTasks(dir), []);
  assert.equal((await fs.stat(path.join(dir, 'archive', `${task.id}.md`))).isFile(), true);
});

test('invalid statuses and missing tasks are handled', async t => {
  const dir = await fixture(t);
  await assert.rejects(createTask(dir, { title:'Bad', status:'blocked' }), /Invalid status/);
  await assert.rejects(updateTask(dir, '../bad', { status:'open' }), /Invalid task id/);
  assert.equal(await updateTask(dir, 'missing', { status:'open' }), null);
});

test('archiving a reused id never overwrites the earlier archive', async t => {
  const dir = await fixture(t);
  const first = await createTask(dir, { title:'Repeat', status:'done', body:'first\n' });
  assert.equal(await archiveTask(dir, first.id), true);
  const second = await createTask(dir, { title:'Repeat', status:'done', body:'second\n' });
  assert.equal(second.id, first.id);
  assert.equal(await archiveTask(dir, second.id), true);
  assert.match(await fs.readFile(path.join(dir, 'archive', 'repeat.md'), 'utf8'), /first/);
  assert.match(await fs.readFile(path.join(dir, 'archive', 'repeat-2.md'), 'utf8'), /second/);
});

test('a UTF-8 BOM does not hide frontmatter', () => {
  const task = parseTask('﻿---\nstatus: review\ncreated: 2026-07-20 10:00\n---\n# Bommed\n\nBody\n', 'bommed.md');
  assert.equal(task.status, 'review');
  assert.equal(task.title, 'Bommed');
});

test('a heading inside a code fence is not mistaken for the title', () => {
  const raw = '---\nstatus: open\n---\n```md\n# not the title\n```\nprose\n';
  const task = parseTask(raw, 'fenced.md');
  assert.equal(task.title, 'fenced');
  assert.equal(task.body, '```md\n# not the title\n```\nprose\n');
});

test('log patches append to a created ## Log section without touching the spec', async t => {
  const dir = await fixture(t);
  const task = await createTask(dir, { title:'Logged', status:'open', body:'Spec text\n' });
  await updateTask(dir, task.id, { log:'claimed; branch fix/x' });
  const after = await updateTask(dir, task.id, { status:'review', log:'status: in-progress → review' });
  assert.equal(after.status, 'review');
  const text = await fs.readFile(path.join(dir, `${task.id}.md`), 'utf8');
  assert.match(text, /Spec text\n\n## Log\n\n- \*\*\d{4}-\d{2}-\d{2} \d{2}:\d{2}\*\* — claimed; branch fix\/x\n- \*\*[^\n]+\*\* — status: in-progress → review\n$/);
  await assert.rejects(updateTask(dir, task.id, { log:'  ' }), /Log entry/);
});

test('concurrent updates to one task are serialized, not lost', async t => {
  const dir = await fixture(t);
  const task = await createTask(dir, { title:'Busy', status:'open', body:'start\n' });
  await Promise.all([
    updateTask(dir, task.id, { status:'in-progress' }),
    updateTask(dir, task.id, { body:'start\nmore\n' }),
    updateTask(dir, task.id, { status:'review' }),
  ]);
  const final = parseTask(await fs.readFile(path.join(dir, `${task.id}.md`), 'utf8'), `${task.id}.md`);
  assert.equal(final.status, 'review');
  assert.equal(final.body, 'start\nmore\n');
});
