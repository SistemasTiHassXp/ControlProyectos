alter table public.projects add column if not exists is_urgent boolean not null default false;

create table if not exists public.project_observations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects on delete cascade,
    author_id uuid not null references public.profiles on delete restrict,
    message text not null check (char_length(message) between 2 and 2000),
    created_at timestamptz not null default now()
);

create index if not exists project_observations_project_created_idx
on public.project_observations (project_id, created_at desc);

alter table public.project_observations enable row level security;
grant select on public.project_observations to authenticated;

drop policy if exists "authenticated read project observations" on public.project_observations;
create policy "authenticated read project observations"
on public.project_observations for select
using (auth.uid() is not null);
