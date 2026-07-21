import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const STATUSES = ['draft', 'open', 'in-progress', 'review', 'done'];
const LABEL_COLORS = { draft: '8b95a2', open: '2f81f7', 'in-progress': 'a371f7', review: 'd4a72c', done: '2da44e' };

const stamp = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const statusOf = issue => {
  const name = issue.labels.map(l => typeof l === 'string' ? l : l.name).find(n => n?.startsWith('status:'));
  return name ? name.slice('status:'.length) : null;
};

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

  const toTask = async issue => {
    const entries = await logOf(issue);
    const spec = (issue.body || '').replace(/\r\n/g, '\n');
    const body = entries.length
      ? `${spec.replace(/\s+$/, '')}\n\n## Log\n\n${entries.map(e => `- **${e.ts}${e.author ? ` · ${e.author}` : ''}** — ${e.text.replace(/\s*\n+\s*/g, ' ')}`).join('\n')}\n`
      : spec;
    return { id: String(issue.number), ref: `#${issue.number}`, title: issue.title, status: statusOf(issue), created: stamp(issue.created_at), body };
  };

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

  return {
    key: `github:${repo}`,
    validId: id => /^\d{1,9}$/.test(id),

    async list() {
      const issues = await boardIssues();
      return Promise.all(issues.map(toTask));
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
      let issue = await getIssue(id);
      if (!issue) return null;
      const body = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.body !== undefined) body.body = stripLog(patch.body);
      if (patch.status !== undefined) {
        const keep = issue.labels.map(l => typeof l === 'string' ? l : l.name).filter(n => !n.startsWith('status:'));
        body.labels = [...keep, `status:${patch.status}`];
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
        } catch (error) { console.error(`meanboard github poll: ${error.message}`); }
      };
      const timer = setInterval(tick, pollMs);
      timer.unref?.();
      return { close: () => clearInterval(timer) };
    },
  };
}
