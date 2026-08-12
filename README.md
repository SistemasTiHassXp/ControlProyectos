# Control de Proyectos

Portal de seguimiento por áreas, preparado para desplegarse en Render con Supabase. Las jefaturas pueden revisar los avances sin iniciar sesión; los responsables solo crean o actualizan sus propios proyectos y pasos. El administrador crea áreas y cuentas desde la aplicación.

## Funciones incluidas

- Vista pública por área con indicadores, avances, responsables, fechas y reporte ejecutivo imprimible.
- Inicio de sesión por usuario y contraseña; Supabase guarda un correo técnico interno que nunca se muestra al usuario.
- Cada responsable pertenece a una sola área y solo puede modificar los proyectos de los que es propietario.
- Proyectos con fecha estimada, estado activo, retrasado, completado o *standby*. En *standby* se registra el área que debe continuar y el motivo.
- Pasos ilimitados, con notas y un botón para insertar pasos entre los existentes, no únicamente al final.
- Alertas visuales en el tablero para proyectos que vencen en los próximos tres días o ya vencieron, sin requerir servicios de pago.

## Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com) y ejecuta por completo [`supabase/schema.sql`](./supabase/schema.sql) en **SQL Editor**.
2. Copia `.env.example` como `.env`, completa las claves de Supabase y define el administrador inicial. Para tu caso: `INITIAL_ADMIN_USERNAME=admin`, `INITIAL_ADMIN_PASSWORD=Hass2026@` y el nombre que prefieras.
3. Ejecuta `npm run bootstrap:admin`. Esto crea el área Administración y el usuario administrador una sola vez.

Si creas el administrador manualmente desde el panel de Supabase, usa [`supabase/create-admin.sql`](./supabase/create-admin.sql) después de crear el usuario técnico `admin@control.local`.
4. Copia la URL del proyecto, la clave `anon` y la clave `service_role`. La última es secreta: solo se usa en Render, nunca se publica en el navegador.

## Ejecutar localmente

```powershell
Copy-Item .env.example .env
npm install
npm run bootstrap:admin
npm start
```

Completa los valores de `.env` y abre `http://localhost:10000`.

## Desplegar en Render

1. Sube esta carpeta a un repositorio GitHub y en Render usa **New > Blueprint**; Render detectará [`render.yaml`](./render.yaml).
2. Durante la creación del Blueprint, define `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Render genera `CRON_SECRET` de forma automática.
3. Verifica el endpoint `https://tu-dominio/health`. El Blueprint fija el servicio web en el plan gratuito y no crea Cron Jobs.

> El endpoint `/api/jobs/due-alerts` y `cron.js` se mantienen para una futura automatización opcional. No se despliegan ni generan costo con este Blueprint.
