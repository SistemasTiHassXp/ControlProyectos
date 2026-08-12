-- Ejecuta una sola vez en Supabase SQL Editor para bases ya creadas.
alter table public.projects add column if not exists standby_contact text;
alter table public.projects add column if not exists standby_started_at timestamptz;

create or replace function public.pause_project_deadline() returns trigger
language plpgsql as $$
declare pause_days integer;
begin
  if new.status = 'standby' and old.status <> 'standby' then
    new.standby_started_at = now();
  elsif old.status = 'standby' and new.status <> 'standby' then
    if old.standby_started_at is not null and new.due_date is not null then
      pause_days = ceil(extract(epoch from (now() - old.standby_started_at)) / 86400.0);
      new.due_date = old.due_date + greatest(pause_days, 0);
    end if;
    new.standby_started_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_pause_deadline on public.projects;
create trigger projects_pause_deadline before update on public.projects for each row execute function public.pause_project_deadline();
