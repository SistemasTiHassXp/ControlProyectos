-- Ejecuta este archivo DESPUÉS de schema.sql y de crear el usuario
-- admin@control.local en Authentication con la contraseña Superadmin.
-- Es seguro ejecutarlo más de una vez.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, username, area_id)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'area_id', '')::uuid
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid()
$$;

create or replace function public.owns_project(project_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (
        select 1 from public.projects
        where id = project_uuid and owner_id = auth.uid()
    ) or public.current_role() = 'admin'
$$;

alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_steps enable row level security;
alter table public.alerts enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.areas, public.profiles, public.projects, public.project_steps
to anon, authenticated;
grant insert, update, delete on public.projects, public.project_steps
to authenticated;
grant select, update on public.alerts to authenticated;
revoke all on public.areas, public.profiles, public.projects, public.project_steps, public.alerts from anon;

drop policy if exists "public can read areas" on public.areas;
drop policy if exists "admin manages areas" on public.areas;
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "members update their profile" on public.profiles;
drop policy if exists "projects are public" on public.projects;
drop policy if exists "owner creates own project" on public.projects;
drop policy if exists "owner updates own project" on public.projects;
drop policy if exists "owner deletes own project" on public.projects;
drop policy if exists "steps are public" on public.project_steps;
drop policy if exists "owner manages project steps" on public.project_steps;
drop policy if exists "users read own alerts" on public.alerts;
drop policy if exists "users update own alerts" on public.alerts;

create policy "public can read areas" on public.areas for select using (auth.uid() is not null);
create policy "admin manages areas" on public.areas for all
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "profiles readable" on public.profiles for select using (auth.uid() is not null);
create policy "members update their profile" on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid());

create policy "projects are public" on public.projects for select using (auth.uid() is not null);
create policy "owner creates own project" on public.projects for insert
with check (
    owner_id = auth.uid()
    and area_id = (select area_id from public.profiles where id = auth.uid())
);
create policy "owner updates own project" on public.projects for update
using (owner_id = auth.uid() or public.current_role() = 'admin')
with check (owner_id = auth.uid() or public.current_role() = 'admin');
create policy "owner deletes own project" on public.projects for delete
using (owner_id = auth.uid() or public.current_role() = 'admin');

create policy "steps are public" on public.project_steps for select using (auth.uid() is not null);
create policy "owner manages project steps" on public.project_steps for all
using (public.owns_project(project_id))
with check (public.owns_project(project_id));

create policy "users read own alerts" on public.alerts for select
using (user_id = auth.uid() or public.current_role() = 'admin');
create policy "users update own alerts" on public.alerts for update
using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.areas (name)
values ('Administración')
on conflict (name) do nothing;

insert into public.profiles (
    id, email, full_name, username, area_id, role, is_active, must_change_password, archived_at
)
select
    id,
    email,
    'Administrador del sistema',
    'admin',
    (select id from public.areas where name = 'Administración'),
    'admin'::public.user_role,
    true,
    false,
    null
from auth.users
where email = 'admin@control.local'
on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    username = excluded.username,
    area_id = excluded.area_id,
    role = excluded.role,
    is_active = true,
    must_change_password = false,
    archived_at = null;

select username, full_name, role, is_active
from public.profiles
where username = 'admin';
