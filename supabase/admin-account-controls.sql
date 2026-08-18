-- Ejecuta una sola vez en Supabase SQL Editor para habilitar desactivación
-- de cuentas y restablecimiento de contraseñas sin borrar proyectos históricos.
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists archived_at timestamptz;
