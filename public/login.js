import { client, profileFor, attachApiAuth } from './common.js';

const supabase = await client();
await attachApiAuth(supabase);

// Always show the login form. If there's an active session, offer to continue or sign out.
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  try {
    const { profile } = await profileFor(supabase);
    const form = document.querySelector('#login-form');
    const controls = document.createElement('div');
    controls.className = 'login-controls';
    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.textContent = `Continuar como ${profile.full_name}`;
    continueBtn.addEventListener('click', () => location.href = profile.role === 'admin' ? '/admin.html' : '/workspace.html');
    const signoutBtn = document.createElement('button');
    signoutBtn.type = 'button';
    signoutBtn.textContent = 'Cerrar sesión actual';
    signoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      alert('Sesión cerrada. Puedes iniciar sesión con otra cuenta.');
      location.reload();
    });
    controls.appendChild(continueBtn);
    controls.appendChild(signoutBtn);
    form.parentNode.insertBefore(controls, form.nextSibling);
  } catch (err) {
    console.error('Error fetching profile on login page:', err);
  }
}

// Submit handler remains — set session based on server response
document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const result = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
  const data = await result.json();
  if (!result.ok) return document.querySelector('#form-error').textContent = data.error || 'Usuario o contraseña incorrectos.';
  const { error } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  if (error) return document.querySelector('#form-error').textContent = 'No se pudo iniciar la sesión.';
  const { profile } = await profileFor(supabase);
  location.href = profile.role === 'admin' ? '/admin.html' : '/workspace.html';
});
