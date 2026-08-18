import { client, escapeHtml, profileFor, signOut } from './common.js';

const supabase = await client();
const { session, profile } = await profileFor(supabase);
const $ = (selector) => document.querySelector(selector);
const state = { areas: [], users: [] };

if (!session) location.href = '/login.html';
if (profile?.role !== 'admin') { alert('Esta página es exclusiva del administrador.'); location.href = '/workspace.html'; }

function roleLabel(role) { return role === 'admin' ? 'Administrador' : role === 'manager' ? 'Jefatura' : 'Responsable de proyectos'; }
function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'US'; }
function dateLabel(value) { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.'); return data; }

async function load() {
  const [areaResult, userResult] = await Promise.all([supabase.from('areas').select('*').order('name'), supabase.from('profiles').select('*, areas(name)').order('full_name')]);
  if (areaResult.error || userResult.error) return alert(areaResult.error?.message || userResult.error.message);
  state.areas = areaResult.data || [];
  state.users = userResult.data || [];
  $('#admin-name').textContent = profile.full_name;
  $('#admin-initials').textContent = initials(profile.full_name);
  $('#user-area').innerHTML = state.areas.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('') || '<option value="">Primero crea un área</option>';
  renderUsers();
  renderAreas();
}

function renderUsers() {
  const search = $('#user-search').value.trim().toLowerCase();
  const visible = state.users.filter((user) => `${user.full_name} ${user.username} ${user.areas?.name || ''}`.toLowerCase().includes(search));
  $('#users-list').innerHTML = visible.map((user) => {
    const actions = user.id === profile.id
      ? '<span class="muted">Tu cuenta</span>'
      : `<button title="Restablecer contraseña" data-reset="${user.id}">⌁</button>${user.is_active === false ? '' : `<button title="Desactivar cuenta" class="danger" data-disable="${user.id}">⌫</button>`}`;
    return `<tr class="${user.is_active === false ? 'inactive' : ''}"><td><span class="avatar">${initials(user.full_name)}</span><strong>${escapeHtml(user.username)}</strong></td><td>${escapeHtml(user.full_name)}</td><td>${escapeHtml(user.areas?.name || 'Sin área')}</td><td><span class="role-pill">${roleLabel(user.role)}</span></td><td><span class="state-pill ${user.is_active === false ? 'off' : ''}">${user.is_active === false ? 'Desactivado' : 'Activo'}</span></td><td>${dateLabel(user.created_at)}</td><td class="table-actions">${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty-row">No hay usuarios que coincidan con la búsqueda.</td></tr>';
  document.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => resetPassword(button.dataset.reset)));
  document.querySelectorAll('[data-disable]').forEach((button) => button.addEventListener('click', () => disableUser(button.dataset.disable)));
}

function renderAreas() {
  $('#areas-list').innerHTML = state.areas.map((area) => `<div class="area-row"><span><b>${escapeHtml(area.name).slice(0, 1).toUpperCase()}</b>${escapeHtml(area.name)}</span><button class="text-button danger" data-area-delete="${area.id}">Eliminar</button></div>`).join('') || '<p>No hay áreas creadas.</p>';
  document.querySelectorAll('[data-area-delete]').forEach((button) => button.addEventListener('click', () => deleteArea(button.dataset.areaDelete)));
}

async function resetPassword(userId) { const password = prompt('Nueva contraseña temporal (mínimo 8 caracteres):'); if (!password) return; try { await api(`/api/admin/users/${userId}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }); alert('Contraseña restablecida. La persona deberá cambiarla al ingresar.'); await load(); } catch (error) { alert(error.message); } }
async function disableUser(userId) { if (!confirm('¿Desactivar esta cuenta? Sus proyectos se conservarán como historial.')) return; try { await api(`/api/admin/users/${userId}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }
async function deleteArea(areaId) { if (!confirm('¿Eliminar esta área? Solo se permite si no tiene proyectos históricos.')) return; try { await api(`/api/admin/areas/${areaId}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }

$('#logout').addEventListener('click', () => signOut(supabase));
$('#user-search').addEventListener('input', renderUsers);
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { const tab = button.dataset.tab; document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab)); $('#users-panel').classList.toggle('hidden', tab !== 'users'); $('#areas-panel').classList.toggle('hidden', tab !== 'areas'); }));
$('#area-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name').trim(); const { error } = await supabase.from('areas').insert({ name }); $('#area-message').textContent = error ? error.message : `Área ${name} creada correctamente.`; if (!error) { form.reset(); await load(); } });
$('#user-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); if (values.password !== values.passwordConfirmation) { $('#user-message').textContent = 'Las contraseñas no coinciden.'; return; } delete values.passwordConfirmation; try { const data = await api('/api/admin/users', { method: 'POST', body: JSON.stringify(values) }); $('#user-message').textContent = `Usuario ${data.user.username} creado correctamente.`; form.reset(); await load(); } catch (error) { $('#user-message').textContent = error.message; } });

load();
