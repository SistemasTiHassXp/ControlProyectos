import { client, escapeHtml, profileFor, signOut } from './common.js';

const supabase = await client();
const { session, profile } = await profileFor(supabase);
if (!session) location.href = '/login.html';
if (profile?.role !== 'admin') { alert('Esta página es exclusiva del administrador del sistema.'); location.href = '/workspace.html'; }
const $ = (selector) => document.querySelector(selector);
const state = { areas: [], users: [] };
async function load() {
  const [areaResult, userResult] = await Promise.all([supabase.from('areas').select('*').order('name'), supabase.from('profiles').select('*, areas(name)').order('full_name')]);
  if (areaResult.error || userResult.error) return alert(areaResult.error?.message || userResult.error.message);
  state.areas = areaResult.data; state.users = userResult.data; $('#admin-name').textContent = profile.full_name; $('#user-area').innerHTML = state.areas.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join(''); $('#areas-list').innerHTML = state.areas.map((area) => `<div class="list-row"><strong>${escapeHtml(area.name)}</strong></div>`).join('') || '<p>No hay áreas creadas.</p>'; $('#users-list').innerHTML = state.users.map((user) => `<div class="list-row"><strong>${escapeHtml(user.full_name)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.areas?.name || 'Sin área')} · ${escapeHtml(user.role)}</span></div>`).join('') || '<p>No hay usuarios creados.</p>';
}
$('#logout').addEventListener('click', () => signOut(supabase));
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button)); $('#users-panel').classList.toggle('hidden', button.dataset.tab !== 'users'); $('#areas-panel').classList.toggle('hidden', button.dataset.tab !== 'areas'); }));
$('#area-form').addEventListener('submit', async (event) => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name').trim(); const { error } = await supabase.from('areas').insert({ name }); $('#area-message').textContent = error ? error.message : `Área ${name} creada correctamente.`; if (!error) { event.currentTarget.reset(); await load(); } });
$('#user-form').addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); const data = await response.json(); $('#user-message').textContent = response.ok ? `Usuario ${data.user.username} creado correctamente.` : data.error; if (response.ok) { event.currentTarget.reset(); await load(); } });
load();
