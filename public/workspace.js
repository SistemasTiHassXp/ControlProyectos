import { client, escapeHtml, formatDate, profileFor, progress, signOut, attachApiAuth } from './common.js';

const supabase = await client();
const { session, profile } = await profileFor(supabase);
await attachApiAuth(supabase);
if (!session) location.href = '/login.html';
if (profile?.role === 'admin') location.href = '/admin.html';
if (profile && !profile.area_id) { alert('Tu cuenta no tiene un área asignada. Pide al administrador que la configure.'); location.href = '/'; }
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const state = { areas: [], projects: [] };
async function load() {
  const [areasResult, projectsResult] = await Promise.all([
    supabase.from('areas').select('*').order('name'),
    supabase.from('projects').select('*, project_steps(*)').eq('owner_id', profile.id).order('created_at', { ascending: false })
  ]);
  if (areasResult.error || projectsResult.error) return alert(areasResult.error?.message || projectsResult.error.message);
  state.areas = areasResult.data;
  state.projects = projectsResult.data.map((project) => ({ ...project, project_steps: project.project_steps.sort((a, b) => Number(a.position) - Number(b.position)) }));
  const area = state.areas.find((item) => item.id === profile.area_id);
  $('#user-name').textContent = profile.full_name;
  $('#user-area-name').textContent = `Área asignada: ${area?.name || 'Sin área'}`;
  $('#standby-area').innerHTML = state.areas.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  render();
}

function render() {
  const container = $('#projects');
  container.innerHTML = state.projects.length ? '' : '<div class="panel">Aún no tienes proyectos. Crea el primero con “Nuevo proyecto”.</div>';
  state.projects.forEach((project) => {
    const node = $('#project-template').content.cloneNode(true);
    const card = node.querySelector('.project-card');
    const value = progress(project);
    const pause = project.status === 'standby'
      ? `Pausa atribuida a ${state.areas.find((area) => area.id === project.standby_area_id)?.name || 'otra área'}${project.standby_contact ? ` · ${project.standby_contact}` : ''}: ${project.standby_reason || ''}`
      : `Fecha estimada: ${formatDate(project.due_date)}`;
    card.querySelector('.status').textContent = project.status === 'standby' ? 'En espera · plazo pausado' : project.status === 'completed' ? 'Completado' : project.status === 'delayed' ? 'Retrasado' : 'Activo';
    card.querySelector('.status').classList.add(project.status);
    card.querySelector('h2').textContent = project.title;
    card.querySelector('.progress-number').textContent = `${value.percent}%`;
    card.querySelector('.project-meta').textContent = `${value.done}/${value.total} pasos completados`;
    card.querySelector('.progress i').style.width = `${value.percent}%`;
    card.querySelector('.card-info').textContent = pause;
    const steps = card.querySelector('.steps');
    project.project_steps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = `step ${step.is_completed ? 'done' : ''}`;
      row.innerHTML = `<input type="checkbox" ${step.is_completed ? 'checked' : ''}><label>${escapeHtml(step.title)}${step.note ? `<small>${escapeHtml(step.note)}</small>` : ''}</label><span class="step-actions"><button class="icon-button" title="Agregar nota">✎</button><button class="icon-button" title="Insertar paso después">＋</button></span>`;
      row.querySelector('input').addEventListener('change', () => updateStep(step, { is_completed: !step.is_completed, completed_at: !step.is_completed ? new Date().toISOString() : null }));
      const [note, insert] = row.querySelectorAll('button');
      note.addEventListener('click', () => noteStep(step));
      insert.addEventListener('click', () => insertStep(project, project.project_steps[index + 1]?.position));
      steps.append(row);
    });
    const actions = card.querySelector('.card-actions');
    actions.innerHTML = project.status === 'standby'
      ? '<button class="text-button">Reanudar proyecto</button><button class="text-button">+ Agregar paso</button><button class="text-button danger">Eliminar</button>'
      : '<button class="text-button">Poner en espera</button><button class="text-button">+ Agregar paso</button><button class="text-button danger">Eliminar</button>';
    const [statusButton, addButton, deleteButton] = actions.querySelectorAll('button');
    statusButton.addEventListener('click', () => project.status === 'standby' ? resume(project) : openStandby(project));
    addButton.addEventListener('click', () => insertStep(project));
    deleteButton.addEventListener('click', () => deleteProject(project));
    container.append(node);
  });
}

async function updateStep(step, values) { const { error } = await supabase.from('project_steps').update(values).eq('id', step.id); if (error) { console.error('Error updating step:', error); return alert(error.message); } await load(); }
async function noteStep(step) { const note = prompt('Nota de avance:', step.note || ''); if (note !== null) await updateStep(step, { note }); }
async function insertStep(project, nextPosition) { const title = prompt('Nombre del paso adicional:'); if (!title?.trim()) return; const previous = project.project_steps.filter((step) => Number(step.position) < Number(nextPosition)).at(-1); const position = nextPosition ? (Number(previous?.position || 0) + Number(nextPosition)) / 2 : Number(project.project_steps.at(-1)?.position || 0) + 1000; const { error } = await supabase.from('project_steps').insert({ project_id: project.id, title: title.trim(), position }); if (error) { console.error('Error inserting step:', error); return alert(error.message); } await load(); }
function openStandby(project) { $('#standby-form').reset(); $('#standby-form [name="projectId"]').value = project.id; $('#standby-dialog').showModal(); }
async function resume(project) { const { error } = await supabase.from('projects').update({ status: 'active', standby_area_id: null, standby_contact: null, standby_reason: null }).eq('id', project.id); if (error) { console.error('Error resuming project:', error); return alert(error.message); } await load(); }

// Delete a project (confirm, call server, reload)
async function deleteProject(project) {
  if (!confirm(`Eliminar proyecto “${project.title}”? Esta acción no se puede deshacer.`)) return;
  try {
    const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error('Delete project failed', response.status, data);
      throw new Error(data.error || 'No se pudo eliminar el proyecto.');
    }
    await load();
  } catch (err) {
    console.error('Error eliminando proyecto:', err);
    alert(err.message || 'No se pudo eliminar el proyecto.');
  }
}

$('#logout').addEventListener('click', () => signOut(supabase));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('#new-project').addEventListener('click', () => $('#project-dialog').showModal());
$('#add-initial-step').addEventListener('click', () => $('#initial-steps').insertAdjacentHTML('beforeend', '<input placeholder="Paso adicional">'));

$('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const submit = event.currentTarget.querySelector('button[type="submit"], button.button') || event.currentTarget.querySelector('button');
  const steps = $$('#initial-steps input').map((input) => input.value.trim()).filter(Boolean);
  submit.disabled = true;
  submit.textContent = 'Creando…';
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.get('title'), description: form.get('description'), dueDate: form.get('dueDate'), steps })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Crear proyecto falló', response.status, data);
      throw new Error(data.error || 'No se pudo crear el proyecto.');
    }
    $('#project-dialog').close();
    event.currentTarget.reset();
    $('#initial-steps').innerHTML = '<input placeholder="Paso 1: Informe" required>';
    await load();
  } catch (error) {
    console.error('Error creando proyecto:', error);
    alert(error.message || 'No se pudo crear el proyecto. Revisa la consola para más detalles.');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Crear proyecto';
  }
});

$('#standby-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const { error } = await supabase.from('projects').update({ status: 'standby', standby_area_id: form.get('areaId'), standby_contact: form.get('contact'), standby_reason: form.get('reason') }).eq('id', form.get('projectId')); if (error) return alert(error.message); $('#standby-dialog').close(); await load(); });

load();
