import express from 'express';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 10000;
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

app.use(express.json());
app.use(express.static('public'));

app.get('/health', (_request, response) => response.json({ ok: true }));
app.get('/api/config', (_request, response) => response.json({ supabaseUrl, anonKey }));

app.post('/api/auth/login', async (request, response) => {
  if (!supabaseUrl || !anonKey || !adminClient) return response.status(503).json({ error: 'Supabase no está configurado.' });
  const username = String(request.body.username || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  if (!username || !password) return response.status(400).json({ error: 'Ingresa usuario y contraseña.' });
  const { data: profile } = await adminClient.from('profiles').select('email').eq('username', username).maybeSingle();
  if (!profile) return response.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  const publicClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.auth.signInWithPassword({ email: profile.email, password });
  if (error || !data.session) return response.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  response.json({ session: data.session });
});

async function requireAdministrator(request, response, next) {
  if (!supabaseUrl || !anonKey || !adminClient) return response.status(503).json({ error: 'Supabase no está configurado.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Inicia sesión para continuar.' });
  const publicClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await publicClient.auth.getUser(token);
  if (error || !user) return response.status(401).json({ error: 'Sesión inválida.' });
  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return response.status(403).json({ error: 'Solo un administrador puede realizar esta acción.' });
  request.actor = user;
  next();
}

app.post('/api/admin/users', requireAdministrator, async (request, response) => {
  const { password, fullName, areaId, role = 'member' } = request.body;
  const username = String(request.body.username || '').trim().toLowerCase();
  const email = `${username}@control.local`;
  if (!password || !fullName || !username || !areaId || !/^[a-z0-9._-]{3,40}$/.test(username)) return response.status(400).json({ error: 'Completa los campos. El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.' });
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, username, area_id: areaId } });
  if (error) return response.status(400).json({ error: error.message });
  const { error: profileError } = await adminClient.from('profiles').upsert({ id: data.user.id, email, full_name: fullName, username, area_id: areaId, role });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return response.status(400).json({ error: profileError.message });
  }
  response.status(201).json({ user: { id: data.user.id, fullName, username } });
});

app.post('/api/projects', async (request, response) => {
  if (!supabaseUrl || !anonKey || !adminClient) return response.status(503).json({ error: 'Supabase no está configurado.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Inicia sesión para crear un proyecto.' });
  const publicClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) return response.status(401).json({ error: 'Sesión inválida.' });
  const { data: profile, error: profileError } = await adminClient.from('profiles').select('id, area_id, role').eq('id', user.id).single();
  if (profileError || !profile?.area_id) return response.status(403).json({ error: 'Tu cuenta no tiene un área asignada.' });
  if (profile.role === 'manager') return response.status(403).json({ error: 'La cuenta de jefatura es solo de consulta.' });
  const title = String(request.body.title || '').trim();
  const description = String(request.body.description || '').trim() || null;
  const dueDate = request.body.dueDate || null;
  const steps = Array.isArray(request.body.steps) ? request.body.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  if (title.length < 3 || title.length > 160) return response.status(400).json({ error: 'El proyecto debe tener entre 3 y 160 caracteres.' });
  if (!steps.length) return response.status(400).json({ error: 'Agrega al menos un paso al proyecto.' });
  const { data: project, error: projectError } = await adminClient.from('projects').insert({ area_id: profile.area_id, owner_id: profile.id, title, description, due_date: dueDate }).select().single();
  if (projectError) return response.status(400).json({ error: projectError.message });
  const { error: stepsError } = await adminClient.from('project_steps').insert(steps.map((step, index) => ({ project_id: project.id, title: step, position: (index + 1) * 1000 })));
  if (stepsError) {
    await adminClient.from('projects').delete().eq('id', project.id);
    return response.status(400).json({ error: stepsError.message });
  }
  response.status(201).json({ project });

// Delete project (owner only)
app.delete('/api/projects/:id', async (request, response) => {
  if (!supabaseUrl || !anonKey || !adminClient) return response.status(503).json({ error: 'Supabase no está configurado.' });
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ error: 'Inicia sesión para continuar.' });
  const publicClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) return response.status(401).json({ error: 'Sesión inválida.' });
  const id = request.params.id;
  const { data: project, error: projError } = await adminClient.from('projects').select('id, owner_id').eq('id', id).maybeSingle();
  if (projError) return response.status(500).json({ error: projError.message });
  if (!project) return response.status(404).json({ error: 'Proyecto no encontrado.' });
  if (project.owner_id !== user.id) return response.status(403).json({ error: 'No tienes permiso para eliminar este proyecto.' });
  const { error: stepsError } = await adminClient.from('project_steps').delete().eq('project_id', id);
  if (stepsError) return response.status(500).json({ error: stepsError.message });
  const { error: deleteError } = await adminClient.from('projects').delete().eq('id', id);
  if (deleteError) return response.status(500).json({ error: deleteError.message });
  response.status(204).end();
});
});

app.post('/api/jobs/due-alerts', async (request, response) => {
  if (!adminClient || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return response.status(401).json({ error: 'No autorizado.' });
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const { data: projects, error } = await adminClient.from('projects').select('id, title, due_date, owner_id').in('status', ['active', 'delayed']).lte('due_date', soon);
  if (error) return response.status(500).json({ error: error.message });
  const alerts = (projects || []).map((project) => ({
    user_id: project.owner_id,
    project_id: project.id,
    kind: project.due_date < today ? 'overdue' : 'due_soon',
    message: project.due_date < today ? `El proyecto “${project.title}” venció el ${project.due_date}.` : `El proyecto “${project.title}” vence el ${project.due_date}.`,
    due_date: project.due_date
  }));
  if (alerts.length) await adminClient.from('alerts').upsert(alerts, { onConflict: 'project_id,kind,due_date' });
  response.json({ created: alerts.length });
});

app.listen(port, () => console.log(`Control de Proyectos en puerto ${port}`));
