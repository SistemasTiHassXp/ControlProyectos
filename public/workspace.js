import { client, escapeHtml, formatDate, profileFor, progress, signOut } from './common.js';

const supabase = await client();
const { session, profile } = await profileFor(supabase);
const $ = (selector) => document.querySelector(selector);
const state = { areas: [], projects: [] };

if (!session) location.href = '/login.html';
if (profile?.role === 'admin') location.href = '/admin.html';
if (profile && !profile.area_id) { alert('Tu cuenta no tiene un área asignada.'); location.href = '/'; }

async function load() {
  const [areasResult, projectsResult] = await Promise.all([
    supabase.from('areas').select('*').order('name'),
    supabase.from('projects').select('*, project_steps(*)').eq('owner_id', profile.id).order('created_at', { ascending: false })
  ]);
  if (areasResult.error || projectsResult.error) return alert(areasResult.error?.message || projectsResult.error.message);
  state.areas = areasResult.data || [];
  state.projects = (projectsResult.data || []).map((project) => ({ ...project, project_steps: (project.project_steps || []).sort((a, b) => Number(a.position) - Number(b.position)) }));
  $('#user-name').textContent = profile.full_name;
  $('#user-area-name').textContent = `Área asignada: ${areaName(profile.area_id)}`;
  $('#standby-area').innerHTML = state.areas.filter((area) => area.id !== profile.area_id).map((area) => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('');
  render();
}

function areaName(areaId) { return state.areas.find((area) => area.id === areaId)?.name || 'Otra área'; }
function standbyDetails(project) {
  if (project.status !== 'standby') return `<strong>Fecha estimada:</strong> ${formatDate(project.due_date)}${project.standby_resumed_by ? `<br><strong>Última reanudación:</strong> ${escapeHtml(project.standby_resumed_by)}` : ''}`;
  return `<div class="standby-box"><strong>En espera por ${escapeHtml(areaName(project.standby_area_id))}</strong><p><b>Contacto:</b> ${escapeHtml(project.standby_contact || 'No indicado')}</p><p><b>Motivo:</b> ${escapeHtml(project.standby_reason || 'No indicado')}</p><p><b>Solicitado por:</b> ${escapeHtml(project.standby_requested_by || 'No indicado')}</p><p><b>Para continuar:</b> ${escapeHtml(project.standby_resume_instructions || 'Pendiente de instrucciones')}</p></div>`;
}

function render() {
  const container = $('#projects');
  container.innerHTML = state.projects.length ? '' : '<div class="panel">Aún no tienes proyectos. Crea el primero con “Nuevo proyecto”.</div>';
  state.projects.forEach((project) => {
    const node = $('#project-template').content.cloneNode(true);
    const card = node.querySelector('.project-card');
    const value = progress(project);
    card.querySelector('.status').textContent = project.status === 'standby' ? 'En espera · plazo pausado' : project.status === 'completed' ? 'Completado' : project.status === 'delayed' ? 'Retrasado' : 'Activo';
    card.querySelector('.status').classList.add(project.status);
    card.querySelector('h2').textContent = project.title;
    card.querySelector('.progress-number').textContent = `${value.percent}%`;
    card.querySelector('.project-meta').textContent = `${value.done}/${value.total} pasos completados`;
    card.querySelector('.progress i').style.width = `${value.percent}%`;
    card.querySelector('.card-info').innerHTML = standbyDetails(project);
    const steps = card.querySelector('.steps');
    project.project_steps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = `step ${step.is_completed ? 'done' : ''}`;
      row.innerHTML = `<input type="checkbox" ${step.is_completed ? 'checked' : ''}><label>${escapeHtml(step.title)}${step.note ? `<small>${escapeHtml(step.note)}</small>` : ''}</label><span class="step-actions"><button class="icon-button" title="Editar nota">✎</button><button class="icon-button" title="Insertar un paso después">＋</button></span>`;
      row.querySelector('input').addEventListener('change', () => updateStep(step, { is_completed: !step.is_completed, completed_at: !step.is_completed ? new Date().toISOString() : null }));
      const [noteButton, insertButton] = row.querySelectorAll('button');
      noteButton.addEventListener('click', () => editNote(step));
      insertButton.addEventListener('click', () => insertStep(project, project.project_steps[index + 1]?.position));
      steps.append(row);
    });
    const actions = card.querySelector('.card-actions');
    actions.innerHTML = `<button class="text-button state-button">${project.status === 'standby' ? 'Reanudar proyecto' : 'Poner en espera'}</button><button class="text-button insert-button">+ Agregar paso</button><button class="text-button delete-button">Eliminar proyecto</button>`;
    actions.querySelector('.state-button').addEventListener('click', () => project.status === 'standby' ? resumeProject(project) : openStandby(project));
    actions.querySelector('.insert-button').addEventListener('click', () => insertStep(project));
    actions.querySelector('.delete-button').addEventListener('click', () => deleteProject(project));
    container.append(node);
  });
}

async function updateStep(step, values) { const { error } = await supabase.from('project_steps').update(values).eq('id', step.id); if (error) return alert(error.message); await load(); }
async function editNote(step) { const note = prompt('Nota del avance:', step.note || ''); if (note !== null) await updateStep(step, { note }); }
async function insertStep(project, nextPosition) { const title = prompt('Nombre del paso que deseas insertar:'); if (!title?.trim()) return; const previous = project.project_steps.filter((step) => Number(step.position) < Number(nextPosition)).at(-1); const position = nextPosition ? (Number(previous?.position || 0) + Number(nextPosition)) / 2 : Number(project.project_steps.at(-1)?.position || 0) + 1000; const { error } = await supabase.from('project_steps').insert({ project_id: project.id, title: title.trim(), position }); if (error) return alert(error.message); await load(); }
function openStandby(project) { $('#standby-form').reset(); $('#standby-form [name="projectId"]').value = project.id; $('#standby-dialog').showModal(); }
async function api(url, options = {}) { const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) } }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No se pudo completar la acción.'); } return response; }
async function resumeProject(project) { try { await api(`/api/projects/${project.id}/resume`, { method: 'POST' }); await load(); } catch (error) { alert(error.message); } }
async function deleteProject(project) { if (!confirm(`¿Eliminar “${project.title}”? Esta acción no se puede deshacer.`)) return; try { await api(`/api/projects/${project.id}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }

$('#logout').addEventListener('click', () => signOut(supabase));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('#change-password').addEventListener('click', () => $('#password-dialog').showModal());
$('#password-form').addEventListener('submit', async (event) => { event.preventDefault(); const password = new FormData(event.currentTarget).get('password'); const { error } = await supabase.auth.updateUser({ password }); if (error) return alert(error.message); await supabase.from('profiles').update({ must_change_password: false }).eq('id', profile.id); $('#password-dialog').close(); event.currentTarget.reset(); alert('Contraseña actualizada correctamente.'); });
$('#new-project').addEventListener('click', () => $('#project-dialog').showModal());
$('#add-initial-step').addEventListener('click', () => $('#initial-steps').insertAdjacentHTML('beforeend', '<input placeholder="Paso adicional">'));
$('#project-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const submit = event.currentTarget.querySelector('[type="submit"]'); const steps = [...document.querySelectorAll('#initial-steps input')].map((input) => input.value.trim()).filter(Boolean); submit.disabled = true; submit.textContent = 'Creando…'; try { await api('/api/projects', { method: 'POST', body: JSON.stringify({ title: form.get('title'), description: form.get('description'), dueDate: form.get('dueDate'), steps }) }); $('#project-dialog').close(); event.currentTarget.reset(); $('#initial-steps').innerHTML = '<input placeholder="Paso 1: Informe" required>'; await load(); } catch (error) { alert(error.message); } finally { submit.disabled = false; submit.textContent = 'Crear proyecto'; } });
$('#standby-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api(`/api/projects/${form.get('projectId')}/standby`, { method: 'POST', body: JSON.stringify({ areaId: form.get('areaId'), contact: form.get('contact'), reason: form.get('reason'), instructions: form.get('instructions') }) }); $('#standby-dialog').close(); await load(); } catch (error) { alert(error.message); } });
load().then(() => { if (profile.must_change_password) $('#password-dialog').showModal(); });
