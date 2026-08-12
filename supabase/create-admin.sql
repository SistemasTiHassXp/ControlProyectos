-- Antes de ejecutar este script, crea en Authentication > Users:
-- Email: admin@control.local
-- Password: Superadmin
-- El correo solo es técnico; el acceso de la aplicación será con usuario: admin.

insert into public.areas (name)
values ('Administración')
on conflict (name) do nothing;

insert into public.profiles (id, email, full_name, username, area_id, role)
select
  auth_user.id,
  auth_user.email,
  'Administrador del Sistema',
  'admin',
  (select id from public.areas where name = 'Administración'),
  'admin'
from auth.users as auth_user
where auth_user.email = 'admin@control.local'
on conflict (id) do update set
  full_name = excluded.full_name,
  username = excluded.username,
  area_id = excluded.area_id,
  role = excluded.role;

-- Verificación: debe mostrar una fila con username admin y role admin.
select username, full_name, role from public.profiles where username = 'admin';
