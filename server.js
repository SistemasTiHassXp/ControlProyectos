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

app.get("/", (_request, response) => {
  response.redirect("/login.html");
});

app.use(express.static("public", { index: false }));

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

  if (profile.is_active === false) {
    response.status(403).json({ error: "Esta cuenta fue desactivada por el administrador." });
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

async function requireManagement(request, response, next) {
  const auth = await authenticate(request, response);
  if (!auth) return;
  if (!["manager", "executive", "admin"].includes(auth.profile.role)) return response.status(403).json({ error: "Solo Gerencia o Jefatura puede realizar esta acción." });
  request.actor = auth;
  next();
}

app.get("/api/projects/:id/observations", async (request, response) => {
  const auth = await authenticate(request, response);
  if (!auth) return;
  const { data, error } = await adminClient.from("project_observations").select("*, profiles(full_name)").eq("project_id", request.params.id).order("created_at", { ascending: false });
  if (error) return response.status(400).json({ error: error.message });
  response.json({ observations: data || [] });
});

app.post("/api/projects/:id/observations", requireManagement, async (request, response) => {
  const message = String(request.body.message || "").trim();
  if (message.length < 2) return response.status(400).json({ error: "Escribe una observación." });
  const { error } = await adminClient.from("project_observations").insert({ project_id: request.params.id, author_id: request.actor.profile.id, message });
  if (error) return response.status(400).json({ error: error.message });
  response.status(201).json({ success: true });
});

app.patch("/api/projects/:id/priority", requireManagement, async (request, response) => {
  const { error } = await adminClient.from("projects").update({ is_urgent: Boolean(request.body.isUrgent) }).eq("id", request.params.id);
  if (error) return response.status(400).json({ error: error.message });
  response.json({ success: true });
});

app.patch("/api/projects/:id/due-date", requireManagement, async (request, response) => {
  const dueDate = String(request.body.dueDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return response.status(400).json({ error: "Indica una fecha válida para la prórroga." });
  const { error } = await adminClient.from("projects").update({ due_date: dueDate }).eq("id", request.params.id);
  if (error) return response.status(400).json({ error: error.message });
  response.json({ success: true });
});

app.patch(
  "/api/account/password",
  async (request, response) => {
    const auth = await authenticate(request, response);
    if (!auth) return;

    const password = String(request.body.password || "");
    if (password.length < 8) {
      return response.status(400).json({
        error: "La contraseña debe tener al menos 8 caracteres."
      });
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(
      auth.user.id,
      { password }
    );
    if (authError) {
      return response.status(400).json({ error: authError.message });
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", auth.user.id);
    if (profileError) {
      return response.status(400).json({ error: profileError.message });
    }

    response.json({ success: true });
  }
);

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
    const readOnlyRole = role === "manager" || role === "executive";

    if (
      !password ||
      !fullName ||
      !username ||
      (!readOnlyRole && !areaId)
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
            area_id: readOnlyRole ? null : areaId
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
        area_id: readOnlyRole ? null : areaId,
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
      ["manager", "executive"].includes(profile.role)
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

app.patch(
  "/api/admin/users/:id/password",
  requireAdministrator,
  async (request, response) => {
    const password = String(request.body.password || "");
    if (password.length < 8) return response.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    const userId = request.params.id;
    if (userId === request.actor.user.id) return response.status(400).json({ error: "No restablezcas tu propia contraseña desde esta pantalla." });
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { password, ban_duration: "none" });
    if (authError) return response.status(400).json({ error: authError.message });
    const { error } = await adminClient.from("profiles").update({ is_active: true, must_change_password: true, archived_at: null }).eq("id", userId);
    if (error) return response.status(400).json({ error: error.message });
    response.json({ success: true });
  }
);

app.post(
  "/api/projects/:id/complete",
  async (request, response) => {
    const auth = await authenticate(request, response);
    if (!auth) return;

    const projectId = request.params.id;
    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .single();
    if (projectError || !project) return response.status(404).json({ error: "Proyecto no encontrado." });
    if (project.owner_id !== auth.user.id && auth.profile.role !== "admin") return response.status(403).json({ error: "No tienes permiso para finalizar este proyecto." });

    const { data: steps, error: stepsError } = await adminClient
      .from("project_steps")
      .select("is_completed")
      .eq("project_id", projectId);
    if (stepsError) return response.status(400).json({ error: stepsError.message });
    if (!steps?.length || steps.some((step) => !step.is_completed)) return response.status(400).json({ error: "Completa todos los pasos antes de finalizar el proyecto." });

    const { error } = await adminClient
      .from("projects")
      .update({ status: "completed" })
      .eq("id", projectId);
    if (error) return response.status(400).json({ error: error.message });
    response.json({ success: true });
  }
);

app.delete(
  "/api/admin/users/:id",
  requireAdministrator,
  async (request, response) => {
    const userId = request.params.id;
    if (userId === request.actor.user.id) return response.status(400).json({ error: "No puedes desactivar tu propia cuenta." });
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (authError) return response.status(400).json({ error: authError.message });
    const { error } = await adminClient.from("profiles").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", userId);
    if (error) return response.status(400).json({ error: error.message });
    response.json({ success: true });
  }
);

app.delete(
  "/api/admin/areas/:id",
  requireAdministrator,
  async (request, response) => {
    const areaId = request.params.id;
    const { count, error: countError } = await adminClient.from("projects").select("id", { count: "exact", head: true }).eq("area_id", areaId);
    if (countError) return response.status(400).json({ error: countError.message });
    if (count) return response.status(400).json({ error: "No se puede eliminar un área con proyectos históricos. Conserva la trazabilidad." });
    const { error } = await adminClient.from("areas").delete().eq("id", areaId);
    if (error) return response.status(400).json({ error: error.message });
    response.json({ success: true });
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
