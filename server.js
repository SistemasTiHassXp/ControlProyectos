import express from "express";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const app = express();

const port = process.env.PORT || 10000;

const supabaseUrl = process.env.SUPABASE_URL;

const anonKey = process.env.SUPABASE_ANON_KEY;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      )
    : null;

app.use(express.json());

app.use(express.static("public"));

app.get("/health", (_request, response) => {
  response.json({
    ok: true
  });
});

app.get(
  "/api/config",
  (_request, response) => {
    response.json({
      supabaseUrl,
      anonKey
    });
  }
);

function getToken(request) {
  return request.headers.authorization?.replace(
    /^Bearer\s+/i,
    ""
  );
}

function createPublicClient() {
  return createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

async function authenticate(
  request,
  response
) {
  if (
    !supabaseUrl ||
    !anonKey ||
    !adminClient
  ) {
    response.status(503).json({
      error:
        "Supabase no está configurado."
    });

    return null;
  }

  const token = getToken(request);

  if (!token) {
    response.status(401).json({
      error:
        "Debes iniciar sesión."
    });

    return null;
  }

  const publicClient =
    createPublicClient();

  const {
    data: { user },
    error
  } =
    await publicClient.auth.getUser(
      token
    );

  if (error || !user) {
    response.status(401).json({
      error: "Sesión inválida."
    });

    return null;
  }

  const {
    data: profile,
    error: profileError
  } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    response.status(401).json({
      error:
        "No se encontró el perfil."
    });

    return null;
  }

  return {
    user,
    profile,
    token
  };
}

app.post(
  "/api/auth/login",
  async (request, response) => {
    if (
      !supabaseUrl ||
      !anonKey ||
      !adminClient
    ) {
      return response
        .status(503)
        .json({
          error:
            "Supabase no está configurado."
        });
    }

    const username = String(
      request.body.username || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      request.body.password || ""
    );

    if (!username || !password) {
      return response
        .status(400)
        .json({
          error:
            "Ingresa usuario y contraseña."
        });
    }

    const { data: account } =
      await adminClient
        .from("profiles")
        .select("email")
        .eq(
          "username",
          username
        )
        .maybeSingle();

    if (!account) {
      return response
        .status(401)
        .json({
          error:
            "Usuario o contraseña incorrectos."
        });
    }

    const publicClient =
      createPublicClient();

    const { data, error } =
      await publicClient.auth.signInWithPassword(
        {
          email: account.email,
          password
        }
      );

    if (
      error ||
      !data.session
    ) {
      return response
        .status(401)
        .json({
          error:
            "Usuario o contraseña incorrectos."
        });
    }

    response.json({
      session: data.session
    });
  }
);
async function requireAdministrator(
  request,
  response,
  next
) {
  const auth = await authenticate(
    request,
    response
  );

  if (!auth) {
    return;
  }

  if (
    auth.profile.role !==
    "admin"
  ) {
    return response
      .status(403)
      .json({
        error:
          "Solo el administrador puede realizar esta acción."
      });
  }

  request.actor = auth;

  next();
}

app.post(
  "/api/admin/users",
  requireAdministrator,
  async (
    request,
    response
  ) => {
    const {
      password,
      fullName,
      areaId,
      role = "member"
    } = request.body;

    const username = String(
      request.body.username ||
        ""
    )
      .trim()
      .toLowerCase();

    const email = `${username}@control.local`;

    if (
      !password ||
      !fullName ||
      !username ||
      !areaId
    ) {
      return response
        .status(400)
        .json({
          error:
            "Completa todos los campos."
        });
    }

    if (
      !/^[a-z0-9._-]{3,40}$/.test(
        username
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            "El nombre de usuario no es válido."
        });
    }

    const {
      data: userData,
      error: userError
    } =
      await adminClient.auth.admin.createUser(
        {
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name:
              fullName,
            username,
            area_id: areaId
          }
        }
      );

    if (userError) {
      return response
        .status(400)
        .json({
          error:
            userError.message
        });
    }

    const {
      error: profileError
    } = await adminClient
      .from("profiles")
      .upsert({
        id: userData.user.id,
        email,
        full_name:
          fullName,
        username,
        area_id: areaId,
        role
      });

    if (
      profileError
    ) {
      await adminClient.auth.admin.deleteUser(
        userData.user.id
      );

      return response
        .status(400)
        .json({
          error:
            profileError.message
        });
    }

    response
      .status(201)
      .json({
        user: {
          id: userData.user.id,
          username,
          fullName
        }
      });
  }
);
app.post(
  "/api/projects",
  async (request, response) => {
    const auth = await authenticate(
      request,
      response
    );

    if (!auth) {
      return;
    }

    const { profile } = auth;

    if (!profile.area_id) {
      return response
        .status(403)
        .json({
          error:
            "Tu cuenta no tiene un área asignada."
        });
    }

    if (
      profile.role === "manager"
    ) {
      return response
        .status(403)
        .json({
          error:
            "La cuenta de jefatura es solo de consulta."
        });
    }

    const title = String(
      request.body.title || ""
    ).trim();

    const description =
      String(
        request.body.description ||
          ""
      ).trim() || null;

    const dueDate =
      request.body.dueDate ||
      null;

    const steps = Array.isArray(
      request.body.steps
    )
      ? request.body.steps
          .map((step) =>
            String(step).trim()
          )
          .filter(Boolean)
      : [];

    if (
      title.length < 3 ||
      title.length > 160
    ) {
      return response
        .status(400)
        .json({
          error:
            "El proyecto debe tener entre 3 y 160 caracteres."
        });
    }

    if (!steps.length) {
      return response
        .status(400)
        .json({
          error:
            "Agrega al menos un paso."
        });
    }

    const {
      data: project,
      error: projectError
    } = await adminClient
      .from("projects")
      .insert({
        area_id:
          profile.area_id,
        owner_id:
          profile.id,
        title,
        description,
        due_date: dueDate
      })
      .select()
      .single();

    if (projectError) {
      return response
        .status(400)
        .json({
          error:
            projectError.message
        });
    }

    const {
      error: stepsError
    } =
      await adminClient
        .from(
          "project_steps"
        )
        .insert(
          steps.map(
            (
              step,
              index
            ) => ({
              project_id:
                project.id,
              title: step,
              position:
                (index + 1) *
                1000
            })
          )
        );

    if (stepsError) {
      await adminClient
        .from("projects")
        .delete()
        .eq(
          "id",
          project.id
        );

      return response
        .status(400)
        .json({
          error:
            stepsError.message
        });
    }

    response
      .status(201)
      .json({
        project
      });
  }
);

app.delete(
  "/api/projects/:id",
  async (request, response) => {
    const auth =
      await authenticate(
        request,
        response
      );

    if (!auth) {
      return;
    }

    const projectId =
      request.params.id;

    const {
      data: project,
      error
    } = await adminClient
      .from("projects")
      .select(
        "id,owner_id,title"
      )
      .eq(
        "id",
        projectId
      )
      .single();

    if (
      error ||
      !project
    ) {
      return response
        .status(404)
        .json({
          error:
            "Proyecto no encontrado."
        });
    }

    if (
      project.owner_id !==
      auth.user.id
    ) {
      return response
        .status(403)
        .json({
          error:
            "Solo el propietario puede eliminar el proyecto."
        });
    }

    await adminClient
      .from(
        "project_steps"
      )
      .delete()
      .eq(
        "project_id",
        projectId
      );

    const {
      error: deleteError
    } =
      await adminClient
        .from("projects")
        .delete()
        .eq(
          "id",
          projectId
        );

    if (deleteError) {
      return response
        .status(500)
        .json({
          error:
            deleteError.message
        });
    }

    response
      .status(204)
      .end();
  }
);
app.post(
  "/api/projects/:id/standby",
  async (request, response) => {
    const auth = await authenticate(
      request,
      response
    );

    if (!auth) {
      return;
    }

    const projectId =
      request.params.id;

    const {
      areaId,
      contact,
      reason,
      instructions
    } = request.body;

    const {
      data: project,
      error: projectError
    } = await adminClient
      .from("projects")
      .select(
        "id,owner_id,status"
      )
      .eq(
        "id",
        projectId
      )
      .single();

    if (
      projectError ||
      !project
    ) {
      return response
        .status(404)
        .json({
          error:
            "Proyecto no encontrado."
        });
    }

    if (
      project.owner_id !==
      auth.user.id
    ) {
      return response
        .status(403)
        .json({
          error:
            "Solo el propietario puede modificar el proyecto."
        });
    }

    const { error } =
      await adminClient
        .from("projects")
        .update({
          status: "standby",
          standby_area_id:
            areaId,
          standby_contact:
            contact,
          standby_reason:
            reason,
          standby_requested_by:
            auth.profile
              .full_name,
          standby_resume_instructions:
            instructions
        })
        .eq(
          "id",
          projectId
        );

    if (error) {
      return response
        .status(400)
        .json({
          error:
            error.message
        });
    }

    response.json({
      success: true
    });
  }
);

app.post(
  "/api/projects/:id/resume",
  async (request, response) => {
    const auth = await authenticate(
      request,
      response
    );

    if (!auth) {
      return;
    }

    const projectId =
      request.params.id;

    const {
      data: project,
      error: projectError
    } = await adminClient
      .from("projects")
      .select(
        "id,owner_id"
      )
      .eq(
        "id",
        projectId
      )
      .single();

    if (
      projectError ||
      !project
    ) {
      return response
        .status(404)
        .json({
          error:
            "Proyecto no encontrado."
        });
    }

    if (
      project.owner_id !==
      auth.user.id
    ) {
      return response
        .status(403)
        .json({
          error:
            "Solo el propietario puede reanudar el proyecto."
        });
    }

    const { error } =
      await adminClient
        .from("projects")
        .update({
          status: "active",
          standby_area_id:
            null,
          standby_contact:
            null,
          standby_reason:
            null,
          standby_started_at:
            null,
          standby_resumed_by:
            auth.profile
              .full_name,
          standby_resumed_at:
            new Date()
              .toISOString()
        })
        .eq(
          "id",
          projectId
        );

    if (error) {
      return response
        .status(400)
        .json({
          error:
            error.message
        });
    }

    response.json({
      success: true
    });
  }
);

app.post(
  "/api/jobs/due-alerts",
  async (request, response) => {
    if (
      !adminClient ||
      request.headers
        .authorization !==
        `Bearer ${process.env.CRON_SECRET}`
    ) {
      return response
        .status(401)
        .json({
          error:
            "No autorizado."
        });
    }

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const soon =
      new Date(
        Date.now() +
          3 *
            86400000
      )
        .toISOString()
        .slice(0, 10);

    const {
      data: projects,
      error
    } = await adminClient
      .from("projects")
      .select(
        "id,title,due_date,owner_id"
      )
      .in("status", [
        "active",
        "delayed"
      ])
      .lte(
        "due_date",
        soon
      );

    if (error) {
      return response
        .status(500)
        .json({
          error:
            error.message
        });
    }

    const alerts =
      (projects || []).map(
        (project) => ({
          user_id:
            project.owner_id,

          project_id:
            project.id,

          kind:
            project.due_date <
            today
              ? "overdue"
              : "due_soon",

          message:
            project.due_date <
            today
              ? `El proyecto "${project.title}" venció el ${project.due_date}.`
              : `El proyecto "${project.title}" vence el ${project.due_date}.`,

          due_date:
            project.due_date
        })
      );

    if (alerts.length) {
      await adminClient
        .from("alerts")
        .upsert(
          alerts,
          {
            onConflict:
              "project_id,kind,due_date"
          }
        );
    }

    response.json({
      created:
        alerts.length
    });
  }
);

app.listen(
  port,
  () => {
    console.log(
      `Control de Proyectos en el puerto ${port}`
    );
  }
);