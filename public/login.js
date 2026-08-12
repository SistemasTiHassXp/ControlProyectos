import { client, profileFor } from './common.js';

const supabase = await client();
const current = await profileFor(supabase);
if (current.profile) location.href = current.profile.role === 'admin' ? '/admin.html' : '/workspace.html';
document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const result = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
  const data = await result.json();
  if (!result.ok) return document.querySelector('#form-error').textContent = data.error || 'Usuario o contraseña incorrectos.';
  const { error } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (error) return document.querySelector('#form-error').textContent = 'No se pudo iniciar sesión.';
  const { profile } = await profileFor(supabase);
  location.href = profile.role === 'admin' ? '/admin.html' : '/workspace.html';
});
