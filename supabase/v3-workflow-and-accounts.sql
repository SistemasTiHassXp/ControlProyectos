-- Ejecuta UNA SOLA VEZ en Supabase > SQL Editor antes de desplegar esta versión.
-- Conserva todos los proyectos existentes y agrega la información nueva.
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists archived_at timestamptz;

alter table public.projects add column if not exists standby_contact text;
alter table public.projects add column if not exists standby_requested_by text;
alter table public.projects add column if not exists standby_resume_instructions text;
alter table public.projects add column if not exists standby_started_at timestamptz;
alter table public.projects add column if not exists standby_resumed_by text;
alter table public.projects add column if not exists standby_resumed_at timestamptz;
