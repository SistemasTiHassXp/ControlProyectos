import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_FULL_NAME } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_PASSWORD) {
  throw new Error('Completa las variables de Supabase y del administrador inicial en .env.');
}

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const username = INITIAL_ADMIN_USERNAME.trim().toLowerCase();
const email = `${username}@control.local`;
const { data: area, error: areaError } = await client.from('areas').upsert({ name: 'Administración' }, { onConflict: 'name' }).select().single();
if (areaError) throw areaError;
const { data: users, error: usersError } = await client.auth.admin.listUsers({ perPage: 1000 });
if (usersError) throw usersError;
let user = users.users.find((item) => item.email === email);
if (!user) {
  const { data, error } = await client.auth.admin.createUser({ email, password: INITIAL_ADMIN_PASSWORD, email_confirm: true, user_metadata: { full_name: INITIAL_ADMIN_FULL_NAME || 'Administrador del Sistema', username, area_id: area.id } });
  if (error) throw error;
  user = data.user;
}
const { error: profileError } = await client.from('profiles').upsert({ id: user.id, email, full_name: INITIAL_ADMIN_FULL_NAME || 'Administrador del Sistema', username, area_id: area.id, role: 'admin' });
if (profileError) throw profileError;
console.log(`Administrador listo: ${username}`);
