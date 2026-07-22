import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTask } from '../lib/format.js';

test('formatTask renders facts, spec, PR context, and activity in one story', () => {
  const out = formatTask({
    id: '64', ref: '#64', title: 'Quick join', status: 'review', agent: 'claude', created: '2026-07-21 09:00',
    body: 'GOAL: one-click join.\n\n- [x] button exists\n\n## Log\n\n- **2026-07-21 10:00 · codex · #71** — opened PR: Quick join\n',
    prs: [{ n: 71, state: 'open', title: 'Quick join', body: 'closes #64', additions: 12, deletions: 3,
      files: [{ path: 'src/home/homeScreen.ts', add: 12, del: 3 }] }],
  });
  assert.match(out, /^# Quick join\n#64 · status: review · agent: claude · created 2026-07-21 09:00\n/);
  assert.match(out, /GOAL: one-click join\./);
  assert.match(out, /## PR #71 · open — Quick join\n1 files, \+12 −3\n\ncloses #64\n\n- src\/home\/homeScreen\.ts \(\+12 −3\)/);
  assert.match(out, /## Activity\n\n- \*\*2026-07-21 10:00 · codex · #71\*\* — opened PR: Quick join\n$/);
});

test('formatTask stays lean without agent, PRs, or log', () => {
  const out = formatTask({ id: 'idea', title: 'Idea', status: 'draft', created: '', body: 'Just a note.\n' });
  assert.equal(out, '# Idea\nidea · status: draft\n\nJust a note.\n');
  assert.doesNotMatch(out, /## Activity|## PR/);
});
