create extension if not exists "pgcrypto";

create type public.user_role as enum (
    'admin',
    'member',
    'manager'
);

create type public.project_status as enum (
    'active',
    'standby',
    'delayed',
    'completed',
    'cancelled'
);

create table public.areas (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now()
);

create table public.profiles (
    id uuid primary key references auth.users on delete cascade,

    email text not null unique,

    full_name text not null,

    username text not null unique,

    area_id uuid references public.areas on delete set null,

    role public.user_role not null default 'member',

    is_active boolean not null default true,

    must_change_password boolean not null default false,

    archived_at timestamptz,

    created_at timestamptz not null default now()
);
create table public.projects (
    id uuid primary key default gen_random_uuid(),

    area_id uuid not null
        references public.areas
        on delete restrict,

    owner_id uuid not null
        references public.profiles
        on delete restrict,

    title text not null
        check (
            char_length(title)
            between 3 and 160
        ),

    description text,

    status public.project_status
        not null
        default 'active',

    due_date date,

    standby_area_id uuid
        references public.areas
        on delete set null,

    standby_contact text,

    standby_reason text,

    standby_requested_by text,

    standby_resume_instructions text,

    standby_started_at timestamptz,

    standby_resumed_by text,

    standby_resumed_at timestamptz,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint standby_details check (
        (
            status = 'standby'
        )
        =
        (
            standby_area_id is not null
        )
    )
);
create table public.project_steps (
    id uuid primary key default gen_random_uuid(),

    project_id uuid not null
        references public.projects
        on delete cascade,

    position numeric(10,4)
        not null
        default 1000,

    title text not null
        check (
            char_length(title)
            between 2 and 300
        ),

    is_completed boolean
        not null
        default false,

    completed_at timestamptz,

    note text,

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now()
);

create table public.alerts (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles
        on delete cascade,

    project_id uuid not null
        references public.projects
        on delete cascade,

    kind text not null
        check (
            kind in (
                'due_soon',
                'overdue'
            )
        ),

    message text not null,

    due_date date not null,

    is_read boolean
        not null
        default false,

    created_at timestamptz
        not null
        default now(),

    unique (
        project_id,
        kind,
        due_date
    )
);
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

    insert into public.profiles (
        id,
        email,
        full_name,
        username,
        area_id
    )
    values (
        new.id,
        new.email,
        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            split_part(new.email, '@', 1)
        ),
        coalesce(
            new.raw_user_meta_data ->> 'username',
            split_part(new.email, '@', 1)
        ),
        nullif(
            new.raw_user_meta_data ->> 'area_id',
            ''
        )::uuid
    )
    on conflict (id)
    do nothing;

    return new;

end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role
    from public.profiles
    where id = auth.uid()
$$;

create or replace function public.owns_project(
    project_uuid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.projects
        where id = project_uuid
        and owner_id = auth.uid()
    )
    or public.current_role() = 'admin'
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin

    new.updated_at = now();

    return new;

end;
$$;

create trigger projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

create trigger steps_updated_at
before update on public.project_steps
for each row
execute function public.set_updated_at();

create or replace function public.pause_project_deadline()
returns trigger
language plpgsql
as $$
declare
    pause_days integer;
begin

    if new.status = 'standby'
    and old.status <> 'standby'
    then

        new.standby_started_at = now();

    elsif old.status = 'standby'
    and new.status <> 'standby'
    then

        if old.standby_started_at is not null
        and new.due_date is not null
        then

            pause_days :=
                ceil(
                    extract(
                        epoch from (
                            now() - old.standby_started_at
                        )
                    ) / 86400.0
                );

            new.due_date :=
                old.due_date
                + greatest(
                    pause_days,
                    0
                );

        end if;

        new.standby_started_at = null;

    end if;

    return new;

end;
$$;

create trigger projects_pause_deadline
before update on public.projects
for each row
execute function public.pause_project_deadline();
create index projects_area_id_idx
on public.projects (area_id);

create index steps_project_position_idx
on public.project_steps (
    project_id,
    position
);

alter table public.areas
enable row level security;

alter table public.profiles
enable row level security;

alter table public.projects
enable row level security;

alter table public.project_steps
enable row level security;

alter table public.alerts
enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.areas, public.profiles, public.projects, public.project_steps
to anon, authenticated;
grant insert, update, delete on public.projects, public.project_steps
to authenticated;
grant select, update on public.alerts to authenticated;
revoke all on public.areas, public.profiles, public.projects, public.project_steps, public.alerts from anon;

create policy "public can read areas"
on public.areas
for select
using (auth.uid() is not null);

create policy "admin manages areas"
on public.areas
for all
using (
    public.current_role() = 'admin'
)
with check (
    public.current_role() = 'admin'
);

create policy "profiles readable"
on public.profiles
for select
using (auth.uid() is not null);

create policy "members update their profile"
on public.profiles
for update
using (
    id = auth.uid()
)
with check (
    id = auth.uid()
);

create policy "projects are public"
on public.projects
for select
using (auth.uid() is not null);

create policy "owner creates own project"
on public.projects
for insert
with check (
    owner_id = auth.uid()
    and area_id = (
        select area_id
        from public.profiles
        where id = auth.uid()
    )
);

create policy "owner updates own project"
on public.projects
for update
using (
    owner_id = auth.uid()
    or public.current_role() = 'admin'
)
with check (
    owner_id = auth.uid()
    or public.current_role() = 'admin'
);

create policy "owner deletes own project"
on public.projects
for delete
using (
    owner_id = auth.uid()
    or public.current_role() = 'admin'
);

create policy "steps are public"
on public.project_steps
for select
using (auth.uid() is not null);

create policy "owner manages project steps"
on public.project_steps
for all
using (
    public.owns_project(project_id)
)
with check (
    public.owns_project(project_id)
);

create policy "users read own alerts"
on public.alerts
for select
using (
    user_id = auth.uid()
    or public.current_role() = 'admin'
);

create policy "users update own alerts"
on public.alerts
for update
using (
    user_id = auth.uid()
)
with check (
    user_id = auth.uid()
);

insert into public.areas (name)
values
    ('TI'),
    ('RRHH'),
    ('Legal'),
    ('Proyectos'),
    ('Arquitectura'),
    ('Finanzas'),
    ('SSOMA'),
    ('Marketing')
on conflict do nothing;
