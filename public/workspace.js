import {
  client,
  escapeHtml,
  formatDate,
  profileFor,
  progress,
  signOut
} from "./common.js";

const supabase = await client();

const {
  session,
  profile
} = await profileFor(supabase);

if (!session) {
  location.href = "/login.html";
}

if (profile?.role === "admin") {
  location.href = "/admin.html";
}

if (profile && !profile.area_id) {
  alert(
    "Tu cuenta no tiene un área asignada. Solicita al administrador que la configure."
  );

  location.href = "/";
}

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [
    ...document.querySelectorAll(
      selector
    )
  ];

const state = {
  areas: [],
  projects: []
};

async function load() {
  const [
    areasResult,
    projectsResult
  ] = await Promise.all([
    supabase
      .from("areas")
      .select("*")
      .order("name"),

    supabase
      .from("projects")
      .select(
        "*, project_steps(*)"
      )
      .eq(
        "owner_id",
        profile.id
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
  ]);

  if (
    areasResult.error ||
    projectsResult.error
  ) {
    return alert(
      areasResult.error
        ?.message ||
        projectsResult.error
          .message
    );
  }

  state.areas =
    areasResult.data || [];

  state.projects = (
    projectsResult.data || []
  ).map((project) => ({
    ...project,

    project_steps: (
      project.project_steps || []
    ).sort(
      (a, b) =>
        Number(a.position) -
        Number(b.position)
    )
  }));

  const area =
    state.areas.find(
      (item) =>
        item.id ===
        profile.area_id
    );

  $("#user-name").textContent =
    profile.full_name;

  $("#user-area-name").textContent =
    `Área asignada: ${
      area?.name ||
      "Sin área"
    }`;

  $("#standby-area").innerHTML =
    state.areas
      .filter(
        (area) =>
          area.id !==
          profile.area_id
      )
      .map(
        (area) =>
          `<option value="${area.id}">
            ${escapeHtml(
              area.name
            )}
          </option>`
      )
      .join("");

  render();
}
function render() {
  const container = $("#projects");

  container.innerHTML = "";

  if (!state.projects.length) {
    container.innerHTML =
      '<div class="panel">Aún no tienes proyectos. Crea el primero con "Nuevo proyecto".</div>';

    return;
  }

  state.projects.forEach((project) => {
    const node =
      $("#project-template").content.cloneNode(true);

    const card =
      node.querySelector(".project-card");

    const value =
      progress(project);

    const status =
      card.querySelector(".status");

    status.textContent =
      project.status === "standby"
        ? "En espera"
        : project.status === "completed"
        ? "Completado"
        : project.status === "delayed"
        ? "Retrasado"
        : "Activo";

    status.classList.add(
      project.status
    );

    card.querySelector("h2").textContent =
      project.title;

    card.querySelector(
      ".progress-number"
    ).textContent =
      `${value.percent}%`;

    card.querySelector(
      ".project-meta"
    ).textContent =
      `${value.done}/${value.total} pasos completados`;

    card.querySelector(
      ".progress i"
    ).style.width =
      `${value.percent}%`;

    const details = [];

    if (
      project.status ===
      "standby"
    ) {
      const areaName =
        state.areas.find(
          (area) =>
            area.id ===
            project.standby_area_id
        )?.name ||
        "Otra área";

      details.push(
        `Área responsable: ${areaName}`
      );

      if (
        project.standby_contact
      ) {
        details.push(
          `Contacto: ${project.standby_contact}`
        );
      }

      if (
        project.standby_requested_by
      ) {
        details.push(
          `Puesto en espera por: ${project.standby_requested_by}`
        );
      }

      if (
        project.standby_reason
      ) {
        details.push(
          `Motivo: ${project.standby_reason}`
        );
      }

      if (
        project.standby_resume_instructions
      ) {
        details.push(
          `Continuar cuando: ${project.standby_resume_instructions}`
        );
      }
    } else {
      details.push(
        `Fecha estimada: ${formatDate(
          project.due_date
        )}`
      );

      if (
        project.standby_resumed_by
      ) {
        details.push(
          `Última reanudación: ${project.standby_resumed_by}`
        );
      }
    }

    card.querySelector(
      ".card-info"
    ).innerHTML =
      details.join("<br>");

    const stepsContainer =
      card.querySelector(".steps");

    project.project_steps.forEach(
      (step, index) => {
        const row =
          document.createElement(
            "div"
          );

        row.className = `step ${
          step.is_completed
            ? "done"
            : ""
        }`;

        row.innerHTML = `
          <input
            type="checkbox"
            ${
              step.is_completed
                ? "checked"
                : ""
            }
          >

          <label>
            ${escapeHtml(
              step.title
            )}

            ${
              step.note
                ? `<small>${escapeHtml(
                    step.note
                  )}</small>`
                : ""
            }
          </label>

          <span class="step-actions">

            <button class="icon-button">
              ✎
            </button>

            <button class="icon-button">
              ＋
            </button>

          </span>
        `;

        const checkbox =
          row.querySelector(
            "input"
          );

        checkbox.addEventListener(
          "change",
          () =>
            updateStep(
              step,
              {
                is_completed:
                  !step.is_completed,

                completed_at:
                  !step.is_completed
                    ? new Date().toISOString()
                    : null
              }
            )
        );

        const [
          noteButton,
          insertButton
        ] =
          row.querySelectorAll(
            "button"
          );

        noteButton.addEventListener(
          "click",
          () =>
            noteStep(step)
        );

        insertButton.addEventListener(
          "click",
          () =>
            insertStep(
              project,
              project
                .project_steps[
                index + 1
              ]?.position
            )
        );

        stepsContainer.append(
          row
        );
      }
    );

    const actions =
      card.querySelector(
        ".card-actions"
      );

    actions.innerHTML =
      project.status ===
      "standby"
        ? `
          <button class="text-button resume-project">
            Reanudar proyecto
          </button>

          <button class="text-button add-step">
            + Agregar paso
          </button>
        `
        : `
          <button class="text-button pause-project">
            Poner en espera
          </button>

          <button class="text-button add-step">
            + Agregar paso
          </button>
        `;

    const [
      statusButton,
      addButton
    ] =
      actions.querySelectorAll(
        "button"
      );

    statusButton.addEventListener(
      "click",
      () =>
        project.status ===
        "standby"
          ? resume(project)
          : openStandby(
              project
            )
    );

    addButton.addEventListener(
      "click",
      () =>
        insertStep(project)
    );

    const deleteButton =
      document.createElement(
        "button"
      );

    deleteButton.className =
      "text-button";

    deleteButton.textContent =
      "Eliminar proyecto";

    deleteButton.addEventListener(
      "click",
      async () => {
        if (
          !confirm(
            `¿Eliminar "${project.title}"?`
          )
        ) {
          return;
        }

        const response =
          await fetch(
            `/api/projects/${project.id}`,
            {
              method:
                "DELETE",

              headers: {
                Authorization: `Bearer ${session.access_token}`
              }
            }
          );

        if (
          !response.ok
        ) {
          const data =
            await response.json();

          return alert(
            data.error
          );
        }

        await load();
      }
    );

    actions.append(
      deleteButton
    );

    container.append(
      node
    );
  });
}
function renderProjectSteps(
  project,
  stepsContainer
) {
  project.project_steps.forEach(
    (step, index) => {
      const row =
        document.createElement("div");

      row.className = `step ${
        step.is_completed
          ? "done"
          : ""
      }`;

      row.innerHTML = `
        <input
          type="checkbox"
          ${
            step.is_completed
              ? "checked"
              : ""
          }
        >

        <label>
          ${escapeHtml(step.title)}

          ${
            step.note
              ? `<small>${escapeHtml(
                  step.note
                )}</small>`
              : ""
          }
        </label>

        <span class="step-actions">
          <button class="icon-button">
            ✎
          </button>

          <button class="icon-button">
            ＋
          </button>
        </span>
      `;

      const checkbox =
        row.querySelector("input");

      checkbox.addEventListener(
        "change",
        () =>
          updateStep(step, {
            is_completed:
              !step.is_completed,

            completed_at:
              !step.is_completed
                ? new Date().toISOString()
                : null
          })
      );

      const [
        noteButton,
        insertButton
      ] =
        row.querySelectorAll(
          "button"
        );

      noteButton.addEventListener(
        "click",
        () => noteStep(step)
      );

      insertButton.addEventListener(
        "click",
        () =>
          insertStep(
            project,
            project.project_steps[
              index + 1
            ]?.position
          )
      );

      stepsContainer.append(row);
    }
  );
}

function renderProjectActions(
  project,
  actions
) {
  actions.innerHTML =
    project.status === "standby"
      ? `
        <button class="text-button resume-project">
          Reanudar proyecto
        </button>

        <button class="text-button add-step">
          + Agregar paso
        </button>
      `
      : `
        <button class="text-button standby-project">
          Poner en espera
        </button>

        <button class="text-button add-step">
          + Agregar paso
        </button>
      `;

  const [
    statusButton,
    addButton
  ] =
    actions.querySelectorAll(
      "button"
    );

  statusButton.addEventListener(
    "click",
    () =>
      project.status ===
      "standby"
        ? resume(project)
        : openStandby(project)
  );

  addButton.addEventListener(
    "click",
    () => insertStep(project)
  );

  const deleteButton =
    document.createElement(
      "button"
    );

  deleteButton.className =
    "text-button";

  deleteButton.textContent =
    "Eliminar proyecto";

  deleteButton.addEventListener(
    "click",
    async () => {
      if (
        !confirm(
          `¿Eliminar "${project.title}"?`
        )
      ) {
        return;
      }

      const response =
        await fetch(
          `/api/projects/${project.id}`,
          {
            method: "DELETE",

            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          }
        );

      if (!response.ok) {
        const data =
          await response.json();

        return alert(
          data.error ||
            "No se pudo eliminar."
        );
      }

      await load();
    }
  );

  actions.append(
    deleteButton
  );
}
async function updateStep(
  step,
  values
) {
  const { error } =
    await supabase
      .from("project_steps")
      .update(values)
      .eq("id", step.id);

  if (error) {
    return alert(
      error.message
    );
  }

  await load();
}

async function noteStep(
  step
) {
  const note = prompt(
    "Nota:",
    step.note || ""
  );

  if (note === null) {
    return;
  }

  await updateStep(step, {
    note
  });
}

async function insertStep(
  project,
  nextPosition
) {
  const title = prompt(
    "Nombre del paso:"
  );

  if (!title?.trim()) {
    return;
  }

  const position =
    nextPosition
      ? nextPosition - 1
      : Number(
          project.project_steps.at(
            -1
          )?.position || 0
        ) + 1000;

  const { error } =
    await supabase
      .from("project_steps")
      .insert({
        project_id:
          project.id,

        title:
          title.trim(),

        position
      });

  if (error) {
    return alert(
      error.message
    );
  }

  await load();
}

function openStandby(
  project
) {
  $("#standby-form").reset();

  $(
    '#standby-form [name="projectId"]'
  ).value = project.id;

  $("#standby-dialog").showModal();
}

async function resume(
  project
) {
  const resumedBy =
    `${profile.full_name} (${getAreaName(
      profile.area_id
    )})`;

  const { error } =
    await supabase
      .from("projects")
      .update({
        status: "active",

        standby_area_id:
          null,

        standby_contact:
          null,

        standby_reason:
          null,

        standby_resumed_by:
          resumedBy,

        standby_resumed_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        project.id
      );

  if (error) {
    return alert(
      error.message
    );
  }

  await load();
}
$("#logout").addEventListener(
  "click",
  () => signOut(supabase)
);

document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener(
      "click",
      () =>
        button
          .closest("dialog")
          .close()
    )
  );

$("#new-project").addEventListener(
  "click",
  () =>
    $("#project-dialog").showModal()
);

$("#add-initial-step").addEventListener(
  "click",
  () => {
    $("#initial-steps").insertAdjacentHTML(
      "beforeend",
      `
        <input
          placeholder="Paso adicional"
        >
      `
    );
  }
);

$("#project-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget
      );

    const submit =
      event.currentTarget.querySelector(
        '[type="submit"]'
      );

    const steps =
      $$("#initial-steps input")
        .map((input) =>
          input.value.trim()
        )
        .filter(Boolean);

    submit.disabled = true;

    try {
      const response =
        await fetch(
          "/api/projects",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization: `Bearer ${session.access_token}`
            },

            body: JSON.stringify({
              title: form.get(
                "title"
              ),

              description:
                form.get(
                  "description"
                ),

              dueDate:
                form.get(
                  "dueDate"
                ),

              steps
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error
        );
      }

      $("#project-dialog").close();

      event.currentTarget.reset();

      $("#initial-steps").innerHTML =
        `
        <input
          placeholder="Paso 1: Informe"
          required
        >
      `;

      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      submit.disabled = false;
    }
  }
);
$("#standby-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const form = new FormData(
      event.currentTarget
    );

    const requestedBy =
      `${profile.full_name} (${getAreaName(
        profile.area_id
      )})`;

    const nextArea =
      getAreaName(
        form.get("areaId")
      );

    const instructions = `
Esperando la intervención del área: ${nextArea}.

Responsable indicado:
${form.get("contact")}.

Para continuar el flujo, el área responsable debe completar la tarea pendiente y comunicar el resultado al propietario original del proyecto.
`.trim();

    const { error } =
      await supabase
        .from("projects")
        .update({
          status: "standby",

          standby_area_id:
            form.get("areaId"),

          standby_contact:
            form.get("contact"),

          standby_reason:
            form.get("reason"),

          standby_requested_by:
            requestedBy,

          standby_resume_instructions:
            instructions
        })
        .eq(
          "id",
          form.get("projectId")
        );

    if (error) {
      return alert(
        error.message
      );
    }

    $("#standby-dialog").close();

    await load();
  }
);

load();