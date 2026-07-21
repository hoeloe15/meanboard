import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubStore } from '../lib/store-github.js';

const label = name => ({ name });
const respond = value => ({ ok: true, status: 200, json: async () => value, text: async () => JSON.stringify(value) });

function fakeGithub(state) {
  state.calls = [];
  return async (url, options = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    state.calls.push({ method, pathname, body });
    if (pathname === '/repos/o/r/labels' && method === 'GET') return respond(state.labels);
    if (pathname === '/repos/o/r/labels' && method === 'POST') { state.labels.push(label(body.name)); return respond(body); }
    if (pathname === '/repos/o/r/issues' && method === 'GET') {
      assert.equal(searchParams.get('state'), 'open');
      return respond(state.issues.filter(issue => issue.state === 'open'));
    }
    if (pathname === '/repos/o/r/issues' && method === 'POST') {
      const issue = { number: ++state.nextNumber, title: body.title, body: body.body, labels: body.labels.map(label),
        state: 'open', comments: 0, created_at: '2026-07-21T08:00:00Z', updated_at: '2026-07-21T08:00:00Z' };
      state.issues.push(issue); return respond(issue);
    }
    const issueMatch = pathname.match(/^\/repos\/o\/r\/issues\/(\d+)$/);
    if (issueMatch) {
      const issue = state.issues.find(i => i.number === Number(issueMatch[1]));
      if (!issue) return { ok: false, status: 404, text: async () => 'nope' };
      if (method === 'PATCH') {
        if (body.labels) issue.labels = body.labels.map(label);
        if (body.body !== undefined) issue.body = body.body;
        if (body.title !== undefined) issue.title = body.title;
        if (body.state) issue.state = body.state;
        issue.updated_at = '2026-07-21T09:00:00Z';
      }
      return respond(issue);
    }
    const commentsMatch = pathname.match(/^\/repos\/o\/r\/issues\/(\d+)\/comments$/);
    if (commentsMatch) {
      const issue = state.issues.find(i => i.number === Number(commentsMatch[1]));
      if (method === 'POST') {
        (state.comments[issue.number] ||= []).push({ body: body.body, user: { login: 'hoeloe15' }, created_at: '2026-07-21T10:30:00Z' });
        issue.comments = state.comments[issue.number].length; issue.updated_at = '2026-07-21T10:30:00Z';
        return respond({});
      }
      return respond(state.comments[issue.number] || []);
    }
    throw new Error(`Unhandled fake route: ${method} ${pathname}`);
  };
}

function baseState() {
  return {
    nextNumber: 60,
    labels: ['status:draft', 'status:open', 'status:in-progress', 'status:review', 'status:done'].map(label),
    issues: [
      { number: 7, title: 'Drain gate', body: 'GOAL: safe deploys.\n\n- [x] drains', labels: [label('status:review'), label('bug')],
        state: 'open', comments: 2, created_at: '2026-07-19T16:20:00Z', updated_at: '2026-07-20T21:41:00Z' },
      { number: 8, title: 'A pull request', body: 'not a task', labels: [label('status:open')], pull_request: {},
        state: 'open', comments: 0, created_at: '2026-07-19T16:20:00Z', updated_at: '2026-07-19T16:20:00Z' },
      { number: 9, title: 'Unrelated issue', body: 'no status label', labels: [label('bug')],
        state: 'open', comments: 0, created_at: '2026-07-19T16:20:00Z', updated_at: '2026-07-19T16:20:00Z' },
    ],
    comments: { 7: [
      { body: '[codex] finding: needs DRAIN_TOKEN', user: { login: 'hoeloe15' }, created_at: '2026-07-20T21:40:00Z' },
      { body: 'status: in-progress → review', user: { login: 'hoeloe15' }, created_at: '2026-07-20T21:41:00Z' },
    ] },
  };
}

const store = state => createGithubStore({ repo: 'o/r', token: 't', fetchImpl: fakeGithub(state) });

test('list maps labels to statuses, filters PRs and unlabeled issues, synthesizes the Log', async () => {
  const state = baseState();
  const tasks = await (await store(state)).list();
  assert.deepEqual(tasks.map(t => t.id), ['7']);
  const task = tasks[0];
  assert.equal(task.status, 'review');
  assert.equal(task.ref, '#7');
  assert.match(task.body, /^GOAL: safe deploys\./);
  assert.match(task.body, /## Log\n\n- \*\*[^\n]* · codex\*\* — finding: needs DRAIN_TOKEN\n- \*\*[^\n]* · hoeloe15\*\* — status: in-progress → review\n$/);
});

test('status update swaps only the status label and logs go in as comments', async () => {
  const state = baseState();
  const s = await store(state);
  const task = await s.update('7', { status: 'done', log: 'review: approved' });
  assert.equal(task.status, 'done');
  const issue = state.issues.find(i => i.number === 7);
  assert.deepEqual(issue.labels.map(l => l.name).sort(), ['bug', 'status:done']);
  assert.equal(state.comments[7].at(-1).body, 'review: approved');
});

test('body updates strip the synthesized Log section before writing', async () => {
  const state = baseState();
  const s = await store(state);
  await s.update('7', { body: 'New spec\n\n## Log\n\n- **x** — should not persist\n' });
  assert.equal(state.issues.find(i => i.number === 7).body, 'New spec\n');
});

test('missing issues 404 as null/false and labels are ensured once', async () => {
  const state = baseState();
  state.labels = state.labels.slice(0, 2);
  const s = await store(state);
  assert.equal(await s.update('999', { status: 'done' }), null);
  assert.equal(await s.archive('999'), false);
  assert.equal(state.labels.length, 5);
});