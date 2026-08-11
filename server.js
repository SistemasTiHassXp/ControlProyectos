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
