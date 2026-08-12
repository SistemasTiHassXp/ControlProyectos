-- Corrige la cuenta con la que ya inicias sesión como "admin".
-- Ejecuta este script en Supabase > SQL Editor y luego cierra sesión en la web.
insert into public.areas (name)
values ('Administración')
on conflict (name) do nothing;

update public.profiles
set
  full_name = 'Administrador del Sistema',
  area_id = (select id from public.areas where name = 'Administración'),
  role = 'admin'
where lower(username) = 'admin';

select username, full_name, role, (select name from public.areas where id = profiles.area_id) as area
from public.profiles
where lower(username) = 'admin';
