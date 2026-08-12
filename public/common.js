import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
export const formatDate = (value) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha estimada';
export function progress(project) { const steps = project.project_steps || []; const done = steps.filter((step) => step.is_completed).length; return { done, total: steps.length, percent: steps.length ? Math.round(done * 100 / steps.length) : 0 }; }
export async function client() { const config = await fetch('/api/config').then((response) => response.json()); if (!config.supabaseUrl || !config.anonKey) throw new Error('Faltan las claves de Supabase en Render.'); return createClient(config.supabaseUrl, config.anonKey); }
export async function profileFor(supabase) { const { data: { session } } = await supabase.auth.getSession(); if (!session) return { session: null, profile: null }; const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single(); if (error) throw new Error('Tu cuenta no tiene un perfil configurado. Contacta al administrador.'); return { session, profile }; }
export async function signOut(supabase) { await supabase.auth.signOut(); location.href = '/'; }
