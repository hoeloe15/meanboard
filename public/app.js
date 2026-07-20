const statuses = ['draft', 'open', 'in-progress', 'review', 'done'];
const labels = { draft:'Draft', open:'Open', 'in-progress':'In Progress', review:'Review', done:'Done' };
const board = document.querySelector('#board'), dialog = document.querySelector('#task-dialog');
const view = document.querySelector('#task-view'), editor = document.querySelector('#task-edit');
let tasks = [], repo = 'meanboard', current = null, editing = false, audio;

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const taskUrl = id => `/api/tasks/${encodeURIComponent(id)}`;

function checks(body) {
  const marks = (body || '').match(/^\s*[-*+]\s+\[[ xX]\]/gm) || [];
  return { done: marks.filter(m => /\[[xX]\]/.test(m)).length, total: marks.length };
}

function card(task) {
  const node = document.createElement('article');
  node.className = 'card'; node.draggable = statuses.includes(task.status); node.tabIndex = 0; node.dataset.id = task.id;
  const title = document.createElement('h3');
  title.textContent = task.title;
  node.append(title);
  const { done, total } = checks(task.body);
  if (total) {
    const row = document.createElement('div'); row.className = 'checks';
    const track = document.createElement('span'); track.className = 'track';
    const bar = document.createElement('span'); bar.className = 'fill'; bar.style.width = `${Math.round(done / total * 100)}%`;
    track.append(bar);
    const label = document.createElement('span'); label.className = 'ratio'; label.textContent = `${done}/${total}`;
    row.append(track, label);
    node.append(row);
  }
  node.onclick = () => showTask(task);
  node.onkeydown = event => { if (event.key === 'Enter') showTask(task); };
  node.ondragstart = event => { event.dataTransfer.setData('text/plain', task.id); node.classList.add('dragging'); };
  node.ondragend = () => node.classList.remove('dragging');
  return node;
}

function render() {
  const known = new Set(statuses);
  const before = new Map();
  for (const node of board.querySelectorAll('.card')) before.set(node.dataset.id, node.getBoundingClientRect());
  for (const section of document.querySelectorAll('.column')) {
    const status = section.dataset.status;
    let items = status ? tasks.filter(task => task.status === status) : tasks.filter(task => !known.has(task.status));
    items.sort((a, b) => (a.created || '').localeCompare(b.created || '') || a.id.localeCompare(b.id));
    if (status === 'done') items.reverse();
    section.querySelector('.cards').replaceChildren(...items.map(card));
    section.querySelector('.count').textContent = items.length;
  }
  const odd = tasks.filter(task => !known.has(task.status)).length;
  document.querySelector('#unknown').hidden = !odd;
  document.querySelector('#archive-all').hidden = !tasks.some(task => task.status === 'done');
  document.querySelector('.column.review').classList.toggle('alive', tasks.some(task => task.status === 'review'));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const node of board.querySelectorAll('.card')) {
      const prev = before.get(node.dataset.id);
      if (!prev) { if (before.size) node.classList.add('enter'); continue; }
      const now = node.getBoundingClientRect();
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (dx || dy) node.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
}

let loading = null, loadQueued = false;
async function load() {
  if (loading) { loadQueued = true; return loading; }
  loading = (async () => {
    const openId = dialog.open && current?.id;
    const data = await api('/api/tasks'); tasks = data.tasks; repo = data.repo;
    document.querySelector('#repo').textContent = repo; document.title = `${repo} · meanboard`; render();
    if (openId) {
      const task = tasks.find(item => item.id === openId);
      if (task) showTask(task, editing); else dialog.close();
    }
  })();
  try { await loading; } finally { loading = null; if (loadQueued) { loadQueued = false; load().catch(console.error); } }
}

function escapeHtml(value) { return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function inline(text) {
  const code = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, value) => `\u0000${code.push(value) - 1}\u0000`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${code[index]}</code>`);
}
function markdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n'), out = [];
  let fence = false, code = [], list = '', box = 0;
  const closeList = () => { if (list) out.push(`</${list}>`); list = ''; };
  for (const line of lines) {
    if (/^```/.test(line)) { if (fence) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; } fence = !fence; continue; }
    if (fence) { code.push(line); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/), item = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (heading) { closeList(); const n = heading[1].length; out.push(`<h${n}>${inline(heading[2])}</h${n}>`); }
    else if (item) { const kind = item[2] ? 'ol' : 'ul'; if (list !== kind) { closeList(); list = kind; out.push(`<${kind}>`); }
      const check = item[1] && item[3].match(/^\[([ xX])\]\s*(.*)$/);
      if (check) out.push(`<li class="check"><label><input type="checkbox" data-check="${box++}"${check[1] === ' ' ? '' : ' checked'}><span>${inline(check[2])}</span></label></li>`);
      else out.push(`<li>${inline(item[3])}</li>`); }
    else { closeList(); if (line.trim()) out.push(`<p>${inline(line)}</p>`); }
  }
  if (fence) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); closeList(); return out.join('');
}

async function toggleCheck(n) {
  const lines = (current.body || '').split('\n');
  let fence = false, seen = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    const match = lines[i].match(/^(\s*[-*+]\s+\[)([ xX])(\].*)$/);
    if (match && ++seen === n) { lines[i] = match[1] + (match[2] === ' ' ? 'x' : ' ') + match[3]; break; }
  }
  try { await patch(current.id, { body: lines.join('\n') }); } catch (error) { alert(error.message); }
}

function showTask(task, preserveEdit = false) {
  if (current?.id !== task.id) document.querySelector('#note-form input').value = '';
  current = task; document.querySelector('#task-title').textContent = task.title;
  const select = document.querySelector('#task-status');
  select.replaceChildren(...statuses.map(status => new Option(labels[status], status)));
  if (!statuses.includes(task.status)) select.append(new Option(`? ${task.status}`, task.status));
  select.value = task.status;
  document.querySelector('#status-pill').dataset.status = task.status;
  document.querySelector('#task-file').textContent = `${task.id}.md`;
  document.querySelector('#task-created').textContent = task.created ? `created ${task.created}` : '';
  document.querySelector('#archive').hidden = task.status !== 'done';
  view.innerHTML = markdown(task.body || '');
  if (!(preserveEdit && editing)) setEditing(false);
  if (!dialog.open) dialog.showModal();
}
let editBase = null;
function setEditing(value) {
  editing = value; view.hidden = value; editor.hidden = !value; document.querySelector('#edit').hidden = value;
  document.querySelector('#note-form').hidden = value;
  editBase = value ? current.body : null;
  if (value) { document.querySelector('#raw').value = `# ${current.title}\n${current.body}`; document.querySelector('#raw').focus(); }
}
async function patch(id, body) { await api(taskUrl(id), { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }); await load(); }

document.querySelector('#add-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
  try { await api('/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ title:data.get('title'), body:data.get('body') }) }); form.reset(); form.closest('details').open = false; await load(); }
  catch (error) { alert(error.message); }
};
for (const section of document.querySelectorAll('.column[data-status]')) {
  section.ondragover = event => { event.preventDefault(); section.classList.add('drop'); };
  section.ondragleave = () => section.classList.remove('drop');
  section.ondrop = async event => { event.preventDefault(); section.classList.remove('drop'); const id = event.dataTransfer.getData('text/plain');
    const task = tasks.find(item => item.id === id); if (task && task.status !== section.dataset.status) try { await patch(id, { status:section.dataset.status }); } catch (error) { alert(error.message); } };
}
view.onchange = event => { if (event.target.dataset.check !== undefined) toggleCheck(Number(event.target.dataset.check)); };
document.querySelector('#note-form').onsubmit = async event => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input'), text = input.value.trim();
  if (!text) return;
  const p = n => String(n).padStart(2, '0'), d = new Date();
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  const body = `${(current.body || '').replace(/\s+$/, '')}\n\n---\n**${stamp}** — ${text}\n`;
  try { await patch(current.id, { body }); input.value = ''; } catch (error) { alert(error.message); }
};
dialog.onclick = event => {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
};
dialog.addEventListener('close', () => { document.querySelector('#note-form input').value = ''; });
document.querySelector('#close').onclick = () => dialog.close();
document.querySelector('#edit').onclick = () => setEditing(true);
document.querySelector('#cancel').onclick = () => setEditing(false);
document.querySelector('#save').onclick = async () => {
  if (editBase !== null && current.body !== editBase &&
    !confirm('This task changed on disk while you were editing. Overwrite those changes?')) return;
  const raw = document.querySelector('#raw').value, match = /^# (.*?)(?:\r?\n|$)/m.exec(raw);
  const title = match?.[1].trim() || current.title, body = match ? raw.slice(match.index + match[0].length) : raw;
  try { await patch(current.id, { title, body }); setEditing(false); } catch (error) { alert(error.message); }
};
document.querySelector('#task-status').onchange = async event => { try { await patch(current.id, { status:event.target.value }); } catch (error) { alert(error.message); } };
document.querySelector('#archive').onclick = async () => { if (!confirm(`Archive “${current.title}”?`)) return;
  try { await api(`${taskUrl(current.id)}/archive`, { method:'POST' }); dialog.close(); await load(); } catch (error) { alert(error.message); } };
document.querySelector('#archive-all').onclick = async () => { const done = tasks.filter(task => task.status === 'done'); if (!confirm(`Archive ${done.length} done task${done.length === 1 ? '' : 's'}?`)) return;
  try { await Promise.all(done.map(task => api(`${taskUrl(task.id)}/archive`, { method:'POST' }))); await load(); } catch (error) { alert(error.message); } };

// Browsers only unlock audio after a user gesture; grab a context on the first one.
window.addEventListener('pointerdown', () => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (Context && !audio) { audio = new Context(); audio.resume(); }
}, { once: true, capture: true });

function chime() {
  const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
  audio ||= new Context(); audio.resume(); const now = audio.currentTime;
  [[now, 660], [now + .14, 880]].forEach(([at, hz]) => { const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.frequency.value = hz;
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.12, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + .18);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(at); oscillator.stop(at + .2); });
}
function reviewAlert(task) {
  chime(); if (!document.hasFocus()) { clearInterval(reviewAlert.flash); let flip = false; reviewAlert.flash = setInterval(() => { document.title = (flip = !flip) ? '● review' : `${repo} · meanboard`; }, 700); }
  if ('Notification' in window && Notification.permission === 'granted') new Notification(`${repo}: ${task.title} ready for review`);
  const header = document.querySelector('.column.review > header'); header.classList.remove('pulse'); void header.offsetWidth; header.classList.add('pulse');
}
window.addEventListener('focus', () => { clearInterval(reviewAlert.flash); document.title = `${repo} · meanboard`; });
const notify = document.querySelector('#notify');
if ('Notification' in window && Notification.permission !== 'granted') notify.hidden = false;
notify.onclick = async () => { if (await Notification.requestPermission() === 'granted') notify.hidden = true; };
const events = new EventSource('/api/events'), dot = document.querySelector('#live-dot'), liveText = document.querySelector('#live-text');
events.onopen = () => { dot.classList.add('on'); dot.title = 'Live'; liveText.textContent = 'live'; };
events.onerror = () => { dot.classList.remove('on'); dot.title = 'Reconnecting'; liveText.textContent = 'reconnecting'; };
events.addEventListener('change', () => load().catch(console.error));
events.addEventListener('review', event => reviewAlert(JSON.parse(event.data)));
load().catch(error => { console.error(error); liveText.textContent = 'offline'; });
