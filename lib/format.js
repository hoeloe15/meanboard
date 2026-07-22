// Render one task as curated markdown for terminal/agent consumption:
// the whole story — spec, linked-PR content, activity — in one read.

const splitLog = body => {
  const match = /^## Log[ \t]*\r?\n?/m.exec(body || '');
  return match ? [body.slice(0, match.index), body.slice(match.index + match[0].length)] : [body || '', ''];
};

export function formatTask(task) {
  const [spec, log] = splitLog(task.body || '');
  const facts = [
    task.ref || task.id,
    `status: ${task.status || '?'}`,
    task.agent ? `agent: ${task.agent}` : null,
    task.created ? `created ${task.created}` : null,
  ].filter(Boolean).join(' · ');
  const out = [`# ${task.title}`, facts, '', spec.replace(/^\s+/, '').replace(/\s+$/, '')];
  for (const pr of task.prs || []) {
    out.push('', `## PR #${pr.n} · ${pr.state} — ${pr.title}`,
      `${pr.files?.length ?? 0} files, +${pr.additions ?? 0} −${pr.deletions ?? 0}`);
    if (pr.body?.trim()) out.push('', pr.body.trim());
    if (pr.files?.length) out.push('', ...pr.files.map(f => `- ${f.path} (+${f.add} −${f.del})`));
  }
  if (log.trim()) out.push('', '## Activity', '', log.replace(/^\s+/, '').replace(/\s+$/, ''));
  return `${out.join('\n')}\n`;
}
