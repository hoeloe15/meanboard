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

function age(created) {
  const then = new Date((created || '').replace(' ', 'T')).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function card(task) {
  const node = document.createElement('article');
  node.className = 'card'; node.draggable = statuses.includes(task.status); node.tabIndex = 0; node.dataset.id = task.id;
  const title = document.createElement('h3'), meta = document.createElement('span');
  title.textContent = task.title; meta.className = 'age'; meta.textContent = age(task.created);
  node.append(title, meta);
  node.onclick = () => showTask(task);
  node.onkeydown = event => { if (event.key === 'Enter') showTask(task); };
  node.ondragstart = event => { event.dataTransfer.setData('text/plain', task.id); node.classList.add('dragging'); };
  node.ondragend = () => node.classList.remove('dragging');
  return node;
}

function render() {
  const known = new Set(statuses);
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
}

async function load() {
  const openId = dialog.open && current?.id;
  const data = await api('/api/tasks'); tasks = data.tasks; repo = data.repo;
  document.querySelector('#repo').textContent = repo; document.title = `${repo} · meanboard`; render();
  if (openId) {
    const task = tasks.find(item => item.id === openId);
    if (task) showTask(task, editing); else dialog.close();
  }
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
  let fence = false, code = [], list = '';
  const closeList = () => { if (list) out.push(`</${list}>`); list = ''; };
  for (const line of lines) {
    if (/^```/.test(line)) { if (fence) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; } fence = !fence; continue; }
    if (fence) { code.push(line); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/), item = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (heading) { closeList(); const n = heading[1].length; out.push(`<h${n}>${inline(heading[2])}</h${n}>`); }
    else if (item) { const kind = item[2] ? 'ol' : 'ul'; if (list !== kind) { closeList(); list = kind; out.push(`<${kind}>`); }
      let value = item[3], box = ''; const check = value.match(/^\[([ xX])\]\s*(.*)$/);
      if (check) { box = check[1] === ' ' ? '☐ ' : '☑ '; value = check[2]; } out.push(`<li>${box}${inline(value)}</li>`); }
    else { closeList(); if (line.trim()) out.push(`<p>${inline(line)}</p>`); }
  }
  if (fence) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); closeList(); return out.join('');
}

function showTask(task, preserveEdit = false) {
  current = task; document.querySelector('#task-title').textContent = task.title;
  const select = document.querySelector('#task-status');
  select.replaceChildren(...statuses.map(status => new Option(labels[status], status)));
  if (!statuses.includes(task.status)) select.append(new Option(`? ${task.status}`, task.status));
  select.value = task.status; document.querySelector('#archive').hidden = task.status !== 'done';
  view.innerHTML = markdown(task.body || '');
  if (!(preserveEdit && editing)) setEditing(false);
  if (!dialog.open) dialog.showModal();
}
function setEditing(value) {
  editing = value; view.hidden = value; editor.hidden = !value; document.querySelector('#edit').hidden = value;
  if (value) { document.querySelector('#raw').value = `# ${current.title}\n${current.body}`; document.querySelector('#raw').focus(); }
}
async function patch(id, body) { await api(taskUrl(id), { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }); await load(); }

document.querySelector('#add-form').onsubmit = async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  try { await api('/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ title:form.get('title'), body:form.get('body') }) }); event.currentTarget.reset(); event.currentTarget.closest('details').open = false; await load(); }
  catch (error) { alert(error.message); }
};
for (const section of document.querySelectorAll('.column[data-status]')) {
  section.ondragover = event => { event.preventDefault(); section.classList.add('drop'); };
  section.ondragleave = () => section.classList.remove('drop');
  section.ondrop = async event => { event.preventDefault(); section.classList.remove('drop'); const id = event.dataTransfer.getData('text/plain');
    const task = tasks.find(item => item.id === id); if (task && task.status !== section.dataset.status) try { await patch(id, { status:section.dataset.status }); } catch (error) { alert(error.message); } };
}
document.querySelector('#close').onclick = () => dialog.close();
document.querySelector('#edit').onclick = () => setEditing(true);
document.querySelector('#cancel').onclick = () => setEditing(false);
document.querySelector('#save').onclick = async () => {
  const raw = document.querySelector('#raw').value, match = /^# (.*?)(?:\r?\n|$)/m.exec(raw);
  const title = match?.[1].trim() || current.title, body = match ? raw.slice(match.index + match[0].length) : raw;
  try { await patch(current.id, { title, body }); setEditing(false); } catch (error) { alert(error.message); }
};
document.querySelector('#task-status').onchange = async event => { try { await patch(current.id, { status:event.target.value }); } catch (error) { alert(error.message); } };
document.querySelector('#archive').onclick = async () => { if (!confirm(`Archive “${current.title}”?`)) return;
  try { await api(`${taskUrl(current.id)}/archive`, { method:'POST' }); dialog.close(); await load(); } catch (error) { alert(error.message); } };
document.querySelector('#archive-all').onclick = async () => { const done = tasks.filter(task => task.status === 'done'); if (!confirm(`Archive ${done.length} done task${done.length === 1 ? '' : 's'}?`)) return;
  try { await Promise.all(done.map(task => api(`${taskUrl(task.id)}/archive`, { method:'POST' }))); await load(); } catch (error) { alert(error.message); } };

function chime() {
  const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
  audio ||= new Audio(); audio.resume(); const now = audio.currentTime;
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
