-- PELIGRO: este script elimina TODOS los datos de Control de Proyectos:
-- usuarios de acceso, áreas, proyectos, pasos, alertas y perfiles.
-- No afecta otros esquemas ni otros productos conectados al proyecto Supabase.

truncate table public.alerts, public.project_steps, public.projects restart identity cascade;
delete from auth.users;

drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.alerts cascade;
drop table if exists public.project_steps cascade;
drop table if exists public.projects cascade;
drop table if exists public.profiles cascade;
drop table if exists public.areas cascade;

drop function if exists public.pause_project_deadline cascade;
drop function if exists public.set_updated_at cascade;
drop function if exists public.owns_project(uuid) cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.handle_new_user cascade;

drop type if exists public.project_status cascade;
drop type if exists public.user_role cascade;
