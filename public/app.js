import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const state = { supabase: null, session: null, profile: null, areas: [], projects: [], activeArea: '', view: 'projects' };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha estimada';
}
function projectProgress(project) {
  const steps = project.project_steps || [];
  const done = steps.filter((step) => step.is_completed).length;
  return { done, total: steps.length, percent: steps.length ? Math.round(done * 100 / steps.length) : 0 };
}
function canEdit(project) { return state.profile && (state.profile.role === 'admin' || project.owner_id === state.profile.id); }
function isUrgent(project) { return project.status !== 'completed' && project.due_date && new Date(`${project.due_date}T23:59:59`) <= new Date(Date.now() + 3 * 86400000); }
function updateClock() { $('#live-clock').textContent = new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeStyle: 'short' }).format(new Date()); }

async function initialize() {
  const config = await fetch('/api/config').then((response) => response.json());
  if (!config.supabaseUrl || !config.anonKey) {
    $('#projects').innerHTML = '<div class="panel">Configura <code>SUPABASE_URL</code> y <code>SUPABASE_ANON_KEY</code> para conectar el tablero.</div>';
    return;
  }
  state.supabase = createClient(config.supabaseUrl, config.anonKey);
  const { data: { session } } = await state.supabase.auth.getSession();
  state.session = session;
  state.supabase.auth.onAuthStateChange(async (_event, nextSession) => { state.session = nextSession; await load(); });
  await load();
}

async function load() {
  const [areasResponse, projectsResponse] = await Promise.all([
    state.supabase.from('areas').select('*').order('name'),
    state.supabase.from('projects').select('*, areas(name), profiles(full_name, username), project_steps(*)').order('created_at', { ascending: false })
  ]);
  if (areasResponse.error || projectsResponse.error) return showError(areasResponse.error?.message || projectsResponse.error.message);
  state.areas = areasResponse.data;
  if (!state.activeArea || !state.areas.some((area) => area.id === state.activeArea)) state.activeArea = state.areas[0]?.id || '';
  state.projects = projectsResponse.data.map((project) => ({ ...project, project_steps: project.project_steps.sort((a, b) => Number(a.position) - Number(b.position)) }));
  state.profile = null;
  if (state.session) {
    const { data } = await state.supabase.from('profiles').select('*').eq('id', state.session.user.id).single();
    state.profile = data;
  }
  render();
}

function render() {
  const activeArea = state.areas.find((area) => area.id === state.activeArea);
  const select = $('#area-filter');
  select.innerHTML = state.areas.map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('');
  select.value = state.activeArea;
  $('#user-area').innerHTML = select.innerHTML;
  const activeProjects = state.projects.filter((project) => project.area_id === state.activeArea);
  const active = activeProjects.filter((project) => ['active', 'delayed', 'standby'].includes(project.status));
  const progressItems = activeProjects.map(projectProgress);
  const percent = progressItems.length ? Math.round(progressItems.reduce((sum, item) => sum + item.percent, 0) / progressItems.length) : 0;
  $('#metric-projects').textContent = active.length;
  $('#metric-progress').textContent = `${percent}%`;
  $('#metric-alerts').textContent = activeProjects.filter(isUrgent).length;
  $('#area-title').textContent = `Proyectos · ${activeArea?.name || 'Sin área'}`;
  $('#area-subtitle').textContent = `${activeProjects.length} proyecto(s) registrados`;
  $('#report-date').textContent = `Información actualizada al ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date())}`;
  const banner = $('#mode-banner');
  const login = $('#login-button');
  if (state.profile) {
    banner.className = 'banner edit';
    banner.querySelector('div').innerHTML = `<strong>${escapeHtml(state.profile.full_name)}</strong><p>${state.profile.role === 'admin' ? 'Administrador del sistema' : `Responsable de ${escapeHtml(state.areas.find((area) => area.id === state.profile.area_id)?.name || 'su área')}`}</p>`;
    login.textContent = 'Cerrar sesión';
    $('#new-project-button').classList.toggle('hidden', !(state.profile.role === 'admin' || state.profile.area_id === state.activeArea));
    $('#admin-tab').classList.toggle('hidden', state.profile.role !== 'admin');
  } else {
    banner.className = 'banner public'; banner.querySelector('div').innerHTML = '<strong>Vista gerencial · solo lectura</strong><p>Consulta los avances por área sin registrarte.</p>';
    login.textContent = 'Iniciar sesión'; $('#new-project-button').classList.add('hidden'); $('#admin-tab').classList.add('hidden');
    if (state.view === 'admin') activateView('projects');
  }
  renderProjects(activeProjects); renderReport(activeProjects);
}

function renderProjects(projects) {
  const container = $('#projects'); container.innerHTML = '';
  if (!projects.length) { container.innerHTML = '<div class="panel">No hay proyectos registrados en esta área todavía.</div>'; return; }
  projects.forEach((project) => {
    const node = $('#project-template').content.cloneNode(true);
    const card = node.querySelector('.project-card'); const progress = projectProgress(project); const editable = canEdit(project);
    card.querySelector('.status').textContent = project.status === 'standby' ? 'En espera' : project.status === 'delayed' ? 'Retrasado' : project.status === 'completed' ? 'Completado' : 'Activo';
    card.querySelector('.status').classList.add(project.status);
    card.querySelector('h2').textContent = project.title;
    card.querySelector('.progress-number').textContent = `${progress.percent}%`;
    card.querySelector('.project-meta').textContent = `Responsable: ${project.profiles?.full_name || 'Sin asignar'}`;
    card.querySelector('.progress i').style.width = `${progress.percent}%`;
    const standby = project.status === 'standby' ? ` · Espera a ${project.standby_area_id ? state.areas.find((area) => area.id === project.standby_area_id)?.name : ''}: ${project.standby_reason || 'sin detalle'}` : '';
    card.querySelector('.card-info').textContent = `${progress.done}/${progress.total} pasos · Termina: ${formatDate(project.due_date)}${standby}${isUrgent(project) ? ' · ⚠ Requiere atención' : ''}`;
    const steps = card.querySelector('.steps');
    project.project_steps.forEach((step, index) => {
      const row = document.createElement('div'); row.className = `step ${step.is_completed ? 'done' : ''}`;
      row.innerHTML = `<input type="checkbox" ${step.is_completed ? 'checked' : ''} ${editable ? '' : 'disabled'}><label>${escapeHtml(step.title)}${step.note ? `<small>${escapeHtml(step.note)}</small>` : ''}</label>${editable ? '<span class="step-actions"><button class="icon-button" title="Nota">✎</button><button class="icon-button" title="Insertar después">＋</button></span>' : ''}`;
      if (editable) {
        row.querySelector('input').addEventListener('change', () => toggleStep(step));
        const [noteButton, insertButton] = row.querySelectorAll('button');
        noteButton.addEventListener('click', () => editNote(step));
        insertButton.addEventListener('click', () => addStep(project, project.project_steps[index + 1]?.position));
      }
      steps.append(row);
    });
    const addStep = card.querySelector('.add-step'); addStep.classList.toggle('hidden', !editable); addStep.addEventListener('click', () => addStepToEnd(project));
    if (editable) {
      const status = document.createElement('button'); status.className = 'text-button'; status.textContent = 'Cambiar estado'; status.addEventListener('click', () => changeStatus(project)); card.querySelector('.card-info').after(status);
    }
    container.append(node);
  });
}

function renderReport(projects) {
  const completed = projects.flatMap((project) => project.project_steps.filter((step) => step.is_completed).map((step) => `<li><strong>${escapeHtml(project.title)}:</strong> ${escapeHtml(step.title)}</li>`)).join('') || '<li>Aún no hay pasos completados.</li>';
  const summary = projects.map((project) => { const { percent } = projectProgress(project); return `<li><strong>${escapeHtml(project.title)}</strong>: ${percent}% · ${escapeHtml(project.status)}</li>`; }).join('') || '<li>Sin proyectos.</li>';
  $('#report-content').innerHTML = `<article class="report-card"><h2>Actividades realizadas</h2><ul>${completed}</ul></article><article class="report-card"><h2>Estado general de proyectos</h2><ul>${summary}</ul></article>`;
}

async function toggleStep(step) { await updateStep(step, { is_completed: !step.is_completed, completed_at: !step.is_completed ? new Date().toISOString() : null }); }
async function editNote(step) { const note = prompt('Nota de avance:', step.note || ''); if (note !== null) await updateStep(step, { note }); }
async function updateStep(step, values) { const { error } = await state.supabase.from('project_steps').update(values).eq('id', step.id); if (error) return showError(error.message); await load(); }
async function addStep(project, nextPosition) { const title = prompt('Nombre del paso adicional:'); if (!title?.trim()) return; const previous = project.project_steps.filter((step) => Number(step.position) < Number(nextPosition)).at(-1); const position = nextPosition ? (Number(previous?.position || 0) + Number(nextPosition)) / 2 : 1000; const { error } = await state.supabase.from('project_steps').insert({ project_id: project.id, title: title.trim(), position }); if (error) return showError(error.message); await load(); }
async function addStepToEnd(project) { const last = project.project_steps.at(-1); const title = prompt('Nombre del paso adicional:'); if (!title?.trim()) return; const { error } = await state.supabase.from('project_steps').insert({ project_id: project.id, title: title.trim(), position: Number(last?.position || 0) + 1000 }); if (error) return showError(error.message); await load(); }
async function changeStatus(project) { const status = prompt('Estado: active, standby, delayed o completed', project.status); if (!['active', 'standby', 'delayed', 'completed'].includes(status)) return; const values = { status, standby_area_id: null, standby_reason: null }; if (status === 'standby') { const areaName = prompt(`Área que debe continuar (${state.areas.map((area) => area.name).join(', ')}):`); const area = state.areas.find((item) => item.name.toLowerCase() === areaName?.toLowerCase()); const reason = prompt('Motivo de la espera:'); if (!area || !reason) return alert('Debes indicar el área y motivo de la espera.'); values.standby_area_id = area.id; values.standby_reason = reason; } const { error } = await state.supabase.from('projects').update(values).eq('id', project.id); if (error) return showError(error.message); await load(); }

function activateView(view) { state.view = view; ['projects', 'report', 'admin'].forEach((name) => { $(`#${name}-view`).classList.toggle('hidden', name !== view); document.querySelector(`[data-view="${name}"]`)?.classList.toggle('active', name === view); }); }
function showError(message) { alert(`No se pudo completar la acción: ${message}`); }

$('#area-filter').addEventListener('change', (event) => { state.activeArea = event.target.value; render(); });
$('#login-button').addEventListener('click', async () => { if (state.session) await state.supabase.auth.signOut(); else $('#auth-dialog').showModal(); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => activateView(button.dataset.view)));
$('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.target); const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) }); const data = await response.json(); if (!response.ok) { $('#auth-error').textContent = data.error || 'Usuario o contraseña incorrectos.'; return; } const { error } = await state.supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }); if (error) $('#auth-error').textContent = 'No se pudo iniciar la sesión.'; else { $('#auth-dialog').close(); event.target.reset(); } });
$('#new-project-button').addEventListener('click', () => $('#project-dialog').showModal());
$('#add-initial-step').addEventListener('click', () => $('#initial-steps').insertAdjacentHTML('beforeend', '<input placeholder="Paso adicional">'));
$('#project-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.target); const { data: project, error } = await state.supabase.from('projects').insert({ area_id: state.activeArea, owner_id: state.profile.id, title: form.get('title'), description: form.get('description') || null, due_date: form.get('dueDate') || null }).select().single(); if (error) return showError(error.message); const titles = [...$('#initial-steps').querySelectorAll('input')].map((input) => input.value.trim()).filter(Boolean); if (titles.length) { const { error: stepsError } = await state.supabase.from('project_steps').insert(titles.map((title, index) => ({ project_id: project.id, title, position: (index + 1) * 1000 }))); if (stepsError) return showError(stepsError.message); } $('#project-dialog').close(); event.target.reset(); $('#initial-steps').innerHTML = '<input placeholder="Paso 1" required>'; await load(); });
$('#area-form').addEventListener('submit', async (event) => { event.preventDefault(); const name = new FormData(event.target).get('name').trim(); const { error } = await state.supabase.from('areas').insert({ name }); if (error) return showError(error.message); event.target.reset(); await load(); });
$('#user-form').addEventListener('submit', async (event) => { event.preventDefault(); const token = state.session?.access_token; const body = Object.fromEntries(new FormData(event.target)); const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) return showError(data.error); alert(`Cuenta creada para ${data.user.fullName}.`); event.target.reset(); });
document.querySelectorAll('[data-admin-view]').forEach((button) => button.addEventListener('click', () => { const view = button.dataset.adminView; document.querySelectorAll('[data-admin-view]').forEach((item) => item.classList.toggle('active', item === button)); $('#admin-users').classList.toggle('hidden', view !== 'users'); $('#admin-areas').classList.toggle('hidden', view !== 'areas'); }));

updateClock(); setInterval(updateClock, 1000); initialize();
