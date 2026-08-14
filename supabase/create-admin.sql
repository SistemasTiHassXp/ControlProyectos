insert into public.areas (name)
values ('Administración')
on conflict (name) do nothing;

insert into public.profiles (
    id,
    email,
    full_name,
    username,
    area_id,
    role
)
select
    auth_user.id,
    auth_user.email,
    'Administrador del Sistema',
    'admin',
    (
        select id
        from public.areas
        where name = 'Administración'
    ),
    'admin'
from auth.users auth_user
where auth_user.email = 'admin@control.local'
on conflict (id)
do update
set
    full_name = excluded.full_name,
    username = excluded.username,
    area_id = excluded.area_id,
    role = excluded.role;