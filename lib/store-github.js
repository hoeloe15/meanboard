import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const STATUSES = ['draft', 'open', 'in-progress', 'review', 'done'];
const LABEL_COLORS = { draft: '8b95a2', open: '2f81f7', 'in-progress': 'a371f7', review: 'd4a72c', done: '2da44e' };

const stamp = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const AGENT_COLOR = '8250df';
const validAgent = agent => typeof agent === 'string' && /^[\w.-]{0,40}$/.test(agent);

const labelOf = (issue, prefix) => {
  const name = issue.labels.map(l => typeof l === 'string' ? l : l.name).find(n => n?.startsWith(prefix));
  return name ? name.slice(prefix.length) : null;
};
const statusOf = issue => labelOf(issue, 'status:');
const agentOf = issue => labelOf(issue, 'agent:') || '';

// The UI's edit box round-trips the synthesized body; the log half lives in
// comments, so it never writes back to the issue body.
const stripLog = body => {
  const match = /^## Log[ \t]*\r?\n?/m.exec(body || '');
  return (match ? body.slice(0, match.index) : body || '').replace(/\s+$/, '') + '\n';
};

export async function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return (await run('gh', ['auth', 'token'])).stdout.trim(); }
  catch { throw new Error('GitHub mode needs auth: run `gh auth login` or set GITHUB_TOKEN'); }
}

export async function detectRepo() {
  try {
    const { stdout } = await run('git', ['remote', 'get-url', 'origin']);
    const match = stdout.trim().match(/github\.com[:/]([^/]+\/[^/.\s]+)/);
    if (match) return match[1];
  } catch { /* fall through */ }
  throw new Error('Could not detect a github.com origin remote; pass --github owner/repo');
}

export async function createGithubStore({ repo, token, fetchImpl = fetch, pollMs = 6000 }) {
  const api = async (path, options = {}) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method: options.method || 'GET',
      headers: {
        authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'user-agent': 'meanboard', ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw Object.assign(new Error(`GitHub ${response.status}: ${detail}`), { status: response.status === 404 ? 404 : 502 });
    }
    return response.status === 204 ? null : response.json();
  };

  const labels = await api(`/repos/${repo}/labels?per_page=100`);
  const have = new Set(labels.map(l => l.name));
  for (const status of STATUSES) if (!have.has(`status:${status}`))
    await api(`/repos/${repo}/labels`, { method: 'POST', body: { name: `status:${status}`, color: LABEL_COLORS[status], description: `meanboard ${status}` } });

  // Agent labels are created lazily on first assignment; issue PATCHes would
  // auto-create them anyway, this just gives them a stable color.
  async function ensureAgentLabel(name) {
    if (have.has(`agent:${name}`)) return;
    await api(`/repos/${repo}/labels`, { method: 'POST', body: { name: `agent:${name}`, color: AGENT_COLOR, description: 'meanboard agent' } }).catch(() => {});
    have.add(`agent:${name}`);
  }

  const commentCache = new Map();
  async function logOf(issue) {
    const cached = commentCache.get(issue.number);
    if (cached && cached.updatedAt === issue.updated_at) return cached.entries;
    let entries = [];
    if (issue.comments > 0) {
      const comments = await api(`/repos/${repo}/issues/${issue.number}/comments?per_page=100`);
      entries = comments.map(comment => {
        let text = (comment.body || '').replace(/\r\n/g, '\n').trim();
        let author = comment.user?.login || '';
        const tag = text.match(/^\[([\w.-]+)\]\s*/);
        if (tag) { author = tag[1]; text = text.slice(tag[0].length); }
        return { ts: stamp(comment.created_at), author, text };
      });
    }
    commentCache.set(issue.number, { updatedAt: issue.updated_at, entries });
    return entries;
  }

  const toTask = async (issue, extraEntries = [], prs) => {
    const entries = [...await logOf(issue), ...extraEntries].sort((a, b) => a.ts.localeCompare(b.ts));
    const spec = (issue.body || '').replace(/\r\n/g, '\n');
    const line = e => `- **${e.ts}${e.author ? ` · ${e.author}` : ''}${e.src ? ` · ${e.src}` : ''}** — ${e.text.replace(/\s*\n+\s*/g, ' ')}`;
    const body = entries.length
      ? `${spec.replace(/\s+$/, '')}\n\n## Log\n\n${entries.map(line).join('\n')}\n`
      : spec;
    const task = { id: String(issue.number), ref: `#${issue.number}`, title: issue.title, status: statusOf(issue), agent: agentOf(issue), created: stamp(issue.created_at), body };
    if (prs) task.prs = prs;
    return task;
  };

  // PRs that cross-reference the issue or are mentioned by URL in its
  // body/comments.
  const prNumberCache = new Map();
  async function linkedPRNumbers(issue) {
    const cached = prNumberCache.get(issue.number);
    if (cached && Date.now() - cached.at < 300_000) return cached.numbers;
    const mentioned = [issue.body || '', ...(await logOf(issue)).map(e => e.text)].join('\n');
    const numbers = new Set([...mentioned.matchAll(/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/g)].map(m => Number(m[1])));
    try {
      const timeline = await api(`/repos/${repo}/issues/${issue.number}/timeline?per_page=100`);
      for (const event of timeline)
        if (event.event === 'cross-referenced' && event.source?.issue?.pull_request) numbers.add(event.source.issue.number);
    } catch { /* timeline is best-effort */ }
    const value = [...numbers].slice(-4);
    prNumberCache.set(issue.number, { at: Date.now(), numbers: value });
    return value;
  }

  // Linked-PR context: description, changed files, conversation, and review
  // verdicts merge into the task so one view carries the whole story.
  async function prContext(issue) {
    const entries = [], prs = [];
    for (const number of await linkedPRNumbers(issue)) {
      const pr = await api(`/repos/${repo}/pulls/${number}`).catch(() => null);
      if (!pr) continue;
      const src = `#${number}`;
      const files = await api(`/repos/${repo}/pulls/${number}/files?per_page=100`).catch(() => []);
      prs.push({ n: number, state: pr.merged_at ? 'merged' : pr.state, title: pr.title,
        body: (pr.body || '').replace(/\r\n/g, '\n'), additions: pr.additions, deletions: pr.deletions,
        files: files.map(f => ({ path: f.filename, add: f.additions, del: f.deletions })) });
      entries.push({ ts: stamp(pr.created_at), author: pr.user?.login || '', src, text: `opened PR: ${pr.title}` });
      const comments = await api(`/repos/${repo}/issues/${number}/comments?per_page=100`).catch(() => []);
      for (const comment of comments)
        entries.push({ ts: stamp(comment.created_at), author: comment.user?.login || '', src, text: (comment.body || '').trim() });
      const reviews = await api(`/repos/${repo}/pulls/${number}/reviews?per_page=100`).catch(() => []);
      for (const review of reviews) {
        if (review.state === 'COMMENTED' && !review.body) continue;
        const verdict = review.state.toLowerCase().replace('_', ' ');
        entries.push({ ts: stamp(review.submitted_at || pr.created_at), author: review.user?.login || '', src, text: `review: ${verdict}${review.body ? ` — ${review.body.trim()}` : ''}` });
      }
    }
    return { entries, prs };
  }

  async function boardIssues() {
    const issues = await api(`/repos/${repo}/issues?state=open&per_page=100`);
    return issues.filter(issue => !issue.pull_request && statusOf(issue));
  }

  async function getIssue(id) {
    try {
      const issue = await api(`/repos/${repo}/issues/${id}`);
      return !issue.pull_request && issue.state === 'open' ? issue : null;
    } catch (error) { if (error.status === 404) return null; throw error; }
  }

  const detailCache = new Map();

  return {
    key: `github:${repo}`,
    link: `https://github.com/${repo}`,
    validId: id => /^\d{1,9}$/.test(id),

    async list() {
      const issues = await boardIssues();
      return Promise.all(issues.map(issue => toTask(issue)));
    },

    async detail(id) {
      const cached = detailCache.get(id);
      if (cached && Date.now() - cached.at < 20_000) return cached.value;
      const issue = await getIssue(id);
      if (!issue) return null;
      const { entries, prs } = await prContext(issue);
      const value = await toTask(issue, entries, prs);
      detailCache.set(id, { at: Date.now(), value });
      return value;
    },

    async create(input) {
      if (!input?.title?.trim()) throw Object.assign(new Error('Title is required'), { code: 'INVALID_TITLE' });
      const status = input.status ?? 'draft';
      if (!STATUSES.includes(status)) throw Object.assign(new Error('Invalid status'), { code: 'INVALID_STATUS' });
      const issue = await api(`/repos/${repo}/issues`, { method: 'POST', body: { title: input.title.trim(), body: input.body || '', labels: [`status:${status}`] } });
      return toTask(issue);
    },

    async update(id, patch) {
      if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw Object.assign(new Error('Invalid status'), { code: 'INVALID_STATUS' });
      if (patch.agent !== undefined && !validAgent(patch.agent))
        throw Object.assign(new Error('Agent must be a short name (letters, digits, . _ -)'), { code: 'INVALID_PATCH' });
      let issue = await getIssue(id);
      if (!issue) return null;
      const body = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.body !== undefined) body.body = stripLog(patch.body);
      if (patch.status !== undefined || patch.agent !== undefined) {
        let names = issue.labels.map(l => typeof l === 'string' ? l : l.name);
        if (patch.status !== undefined) names = [...names.filter(n => !n.startsWith('status:')), `status:${patch.status}`];
        if (patch.agent !== undefined) {
          names = names.filter(n => !n.startsWith('agent:'));
          if (patch.agent) { names.push(`agent:${patch.agent}`); await ensureAgentLabel(patch.agent); }
        }
        body.labels = names;
      }
      if (Object.keys(body).length) issue = await api(`/repos/${repo}/issues/${id}`, { method: 'PATCH', body });
      if (patch.log !== undefined) {
        await api(`/repos/${repo}/issues/${id}/comments`, { method: 'POST', body: { body: patch.log.trim() } });
        issue = await getIssue(id) ?? issue;
      }
      return toTask(issue);
    },

    async archive(id) {
      const issue = await getIssue(id);
      if (!issue) return false;
      await api(`/repos/${repo}/issues/${id}`, { method: 'PATCH', body: { state: 'closed' } });
      return true;
    },

    async watch(onEvent) {
      let snapshot = new Map((await boardIssues()).map(issue => [issue.number, { status: statusOf(issue), updated: issue.updated_at }]));
      // A merged linked PR is the owner's sign-off: auto-move review → done.
      const settleReviews = async issues => {
        for (const issue of issues.filter(i => statusOf(i) === 'review')) {
          for (const number of await linkedPRNumbers(issue)) {
            const pr = await api(`/repos/${repo}/pulls/${number}`).catch(() => null);
            if (!pr?.merged_at) continue;
            await this.update(String(issue.number), { status: 'done', log: `[meanboard] linked PR #${number} merged — review complete, moved to done` });
            onEvent('change');
            break;
          }
        }
      };
      let ticks = 0;
      const tick = async () => {
        try {
          const issues = await boardIssues();
          const next = new Map(issues.map(issue => [issue.number, { status: statusOf(issue), updated: issue.updated_at }]));
          let changed = next.size !== snapshot.size;
          for (const [number, state] of next) {
            const previous = snapshot.get(number);
            if (!previous || previous.status !== state.status || previous.updated !== state.updated) changed = true;
            if (state.status === 'review' && previous?.status !== 'review')
              onEvent('review', { id: String(number), title: issues.find(issue => issue.number === number)?.title || `#${number}` });
          }
          snapshot = next;
          if (changed) onEvent('change');
          if (ticks++ % 10 === 0) await settleReviews(issues);
        } catch (error) { console.error(`meanboard github poll: ${error.message}`); }
      };
      setTimeout(tick, 500).unref?.();
      const timer = setInterval(tick, pollMs);
      timer.unref?.();
      return { close: () => clearInterval(timer) };
    },
  };
}
