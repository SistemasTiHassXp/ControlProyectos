import { client, escapeHtml, profileFor, signOut } from './common.js';

const supabase = await client();
const { session, profile } = await profileFor(supabase);
const $ = (selector) => document.querySelector(selector);
const state = { areas: [], users: [] };
if (!session) location.href = '/login.html';
if (profile?.role !== 'admin') { alert('Esta página es exclusiva del administrador.'); location.href = '/workspace.html'; }

async function load() {
  const [areaResult, userResult] = await Promise.all([
    supabase.from('areas').select('*').order('name'),
    supabase.from('profiles').select('*, areas(name)').order('full_name')
  ]);
  if (areaResult.error || userResult.error) return alert(areaResult.error?.message || userResult.error.message);
  state.areas = areaResult.data || [];
  state.users = userResult.data || [];
  $('#admin-name').textContent = profile.full_name;
  $('#user-area').innerHTML = state.areas.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('');
  renderLists();
}

function roleLabel(role) { return role === 'admin' ? 'Administrador' : role === 'manager' ? 'Jefatura' : 'Responsable'; }
function renderLists() {
  $('#users-list').innerHTML = state.users.map((user) => `<div class="list-row user-row ${user.is_active === false ? 'inactive' : ''}"><div><strong>${escapeHtml(user.full_name)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.areas?.name || 'Sin área')} · ${roleLabel(user.role)}${user.is_active === false ? ' · Cuenta desactivada' : ''}</span></div><div class="list-actions">${user.id !== profile.id ? `<button data-reset="${user.id}" class="text-button">Restablecer clave</button>${user.is_active === false ? '' : `<button data-disable="${user.id}" class="text-button danger">Desactivar</button>`}` : '<span class="muted">Tu cuenta</span>'}</div></div>`).join('') || '<p>No hay usuarios creados.</p>';
  $('#areas-list').innerHTML = state.areas.map((area) => `<div class="list-row"><strong>${escapeHtml(area.name)}</strong><button class="text-button danger" data-area-delete="${area.id}">Eliminar</button></div>`).join('') || '<p>No hay áreas creadas.</p>';
  document.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => resetPassword(button.dataset.reset)));
  document.querySelectorAll('[data-disable]').forEach((button) => button.addEventListener('click', () => disableUser(button.dataset.disable)));
  document.querySelectorAll('[data-area-delete]').forEach((button) => button.addEventListener('click', () => deleteArea(button.dataset.areaDelete)));
}
async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.'); return data; }
async function resetPassword(userId) { const password = prompt('Nueva contraseña temporal (mínimo 8 caracteres):'); if (!password) return; try { await api(`/api/admin/users/${userId}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }); alert('Contraseña restablecida. La persona debe cambiarla al ingresar.'); await load(); } catch (error) { alert(error.message); } }
async function disableUser(userId) { if (!confirm('¿Desactivar esta cuenta? Sus proyectos se conservarán como historial.')) return; try { await api(`/api/admin/users/${userId}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }
async function deleteArea(areaId) { if (!confirm('¿Eliminar esta área? Solo se permite si no tiene proyectos históricos.')) return; try { await api(`/api/admin/areas/${areaId}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }

$('#logout').addEventListener('click', () => signOut(supabase));
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button)); $('#users-panel').classList.toggle('hidden', button.dataset.tab !== 'users'); $('#areas-panel').classList.toggle('hidden', button.dataset.tab !== 'areas'); }));
$('#area-form').addEventListener('submit', async (event) => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name').trim(); const { error } = await supabase.from('areas').insert({ name }); $('#area-message').textContent = error ? error.message : `Área ${name} creada correctamente.`; if (!error) { event.currentTarget.reset(); await load(); } });
$('#user-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const data = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); $('#user-message').textContent = `Usuario ${data.user.username} creado correctamente.`; event.currentTarget.reset(); await load(); } catch (error) { $('#user-message').textContent = error.message; } });
load();
