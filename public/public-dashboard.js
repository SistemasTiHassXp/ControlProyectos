import {
  client,
  escapeHtml,
  formatDate,
  progress
} from "./common.js";

const supabase = await client();

const state = {
  areas: [],
  projects: [],
  activeArea: ""
};

const $ = (selector) =>
  document.querySelector(selector);

function urgent(project) {
  return (
    ![
      "completed",
      "standby"
    ].includes(project.status) &&
    project.due_date &&
    new Date(
      `${project.due_date}T23:59:59`
    ) <=
      new Date(
        Date.now() +
          3 * 86400000
      )
  );
}

function clock() {
  $("#live-clock").textContent =
    new Intl.DateTimeFormat(
      "es-PE",
      {
        dateStyle: "full",
        timeStyle: "short"
      }
    ).format(new Date());
}

function getAreaName(id) {
  return (
    state.areas.find(
      (area) => area.id === id
    )?.name || "Sin área"
  );
}

async function load() {
  const [
    areaResult,
    projectResult
  ] = await Promise.all([
    supabase
      .from("areas")
      .select("*")
      .order("name"),

    supabase
      .from("projects")
      .select(`
        *,
        profiles(full_name),
        project_steps(*)
      `)
      .order("created_at", {
        ascending: false
      })
  ]);

  if (
    areaResult.error ||
    projectResult.error
  ) {
    $("#projects").innerHTML =
      `
      <div class="panel">
        No se pudo cargar la información.
      </div>
    `;

    return;
  }

  state.areas =
    areaResult.data || [];

  state.projects =
    (
      projectResult.data || []
    ).map((project) => ({
      ...project,

      project_steps:
        (
          project.project_steps ||
          []
        ).sort(
          (a, b) =>
            Number(a.position) -
            Number(b.position)
        )
    }));

  state.activeArea ||=
    state.areas[0]?.id || "";

  render();
}
function render() {
  const area =
    state.areas.find(
      (item) =>
        item.id ===
        state.activeArea
    );

  const projects =
    state.projects.filter(
      (item) =>
        item.area_id ===
        state.activeArea
    );

  const values =
    state.projects.map(
      progress
    );

  const average =
    values.length
      ? Math.round(
          values.reduce(
            (sum, item) =>
              sum +
              item.percent,
            0
          ) / values.length
        )
      : 0;

  const active =
    state.projects.filter(
      (project) =>
        [
          "active",
          "delayed"
        ].includes(
          project.status
        )
    );

  const completed =
    state.projects.filter(
      (project) =>
        project.status ===
        "completed"
    );

  const delayed =
    state.projects.filter(
      (project) =>
        project.status ===
          "delayed" ||
        (
          project.due_date &&
          new Date(
            `${project.due_date}T23:59:59`
          ) < new Date() &&
          ![
            "completed",
            "standby"
          ].includes(
            project.status
          )
        )
    );

  $("#area-filter").innerHTML =
    state.areas
      .map(
        (item) =>
          `
          <option
            value="${item.id}">
            ${escapeHtml(
              item.name
            )}
          </option>
        `
      )
      .join("");

  $("#area-filter").value =
    state.activeArea;

  $("#area-title").textContent =
    `Proyectos · ${
      area?.name ||
      "Sin área"
    }`;

  $("#area-subtitle").textContent =
    `${projects.length} proyecto(s) registrados · historial incluido`;

  $("#metric-projects").textContent =
    active.length;

  $("#metric-completed").textContent =
    completed.length;

  $("#metric-progress").textContent =
    `${average}%`;

  $("#metric-delayed").textContent =
    delayed.length;

  $("#metric-alerts").textContent =
    state.projects.filter(
      urgent
    ).length;
     const colors = [
    "#6366f1",
    "#3b82f6",
    "#14b8a6",
    "#f59e0b",
    "#f97316",
    "#ef4444",
    "#ec4899",
    "#8b5cf6"
  ];

  const summary =
    state.areas
      .map(
        (
          item,
          index
        ) => {
          const scoped =
            state.projects.filter(
              (
                project
              ) =>
                project.area_id ===
                item.id
            );

          const entries =
            scoped.map(
              progress
            );

          return {
            name:
              item.name,

            total:
              scoped.length,

            completed:
              scoped.filter(
                (
                  project
                ) =>
                  project.status ===
                  "completed"
              ).length,

            active:
              scoped.filter(
                (
                  project
                ) =>
                  [
                    "active",
                    "standby",
                    "delayed"
                  ].includes(
                    project.status
                  )
              ).length,

            value:
              entries.length
                ? Math.round(
                    entries.reduce(
                      (
                        sum,
                        entry
                      ) =>
                        sum +
                        entry.percent,
                      0
                    ) /
                      entries.length
                  )
                : 0,

            color:
              colors[
                index %
                  colors.length
              ]
          };
        }
      )
      .sort(
        (a, b) =>
          b.value -
          a.value
      );

  const total =
    state.projects.length ||
    1;

  let cursor = 0;

  const stops =
    summary
      .filter(
        (item) =>
          item.total
      )
      .map(
        (item) => {
          const from =
            cursor;

          cursor +=
            (item.total /
              total) *
            100;

          return `${item.color} ${from}% ${cursor}%`;
        }
      )
      .join(", ") ||
    "#e8edf4 0 100%";

  $("#donut-chart").style.background =
    `conic-gradient(${stops})`;

  $("#donut-total").textContent =
    state.projects.length;

  $("#area-legend").innerHTML =
    summary
      .map(
        (item) => `
          <div>

            <i
              style="background:${item.color}">
            </i>

            <span>
              ${escapeHtml(
                item.name
              )}
            </span>

            <strong>
              ${item.total}
            </strong>

          </div>
        `
      )
      .join("") ||
    "<p>Sin proyectos aún.</p>";

  $("#area-chart").innerHTML =
    summary
      .map(
        (item) => `
          <div class="chart-row">

            <span>
              ${escapeHtml(
                item.name
              )}
            </span>

            <div>

              <i
                style="width:${item.value}%">
              </i>

            </div>

            <strong>
              ${item.value}%
            </strong>

          </div>
        `
      )
      .join("") ||
    "<p>No hay áreas para comparar.</p>";

  $("#comparison-chart").innerHTML =
    summary
      .map(
        (item) => `
          <div class="compare-row">

            <span>
              ${escapeHtml(
                item.name
              )}
            </span>

            <div class="bars">

              <i
                class="complete"
                style="height:${Math.max(
                  item.completed *
                    16,
                  3
                )}px"
                title="${item.completed} completados">
              </i>

              <i
                class="running"
                style="height:${Math.max(
                  item.active *
                    16,
                  3
                )}px"
                title="${item.active} en ejecución">
              </i>

            </div>

            <small>
              ${item.completed}
              finalizados ·
              ${item.active}
              activos
            </small>

          </div>
        `
      )
      .join("") ||
    "<p>No hay datos todavía.</p>";
     const container = $("#projects");

  container.innerHTML = projects.length
    ? ""
    : '<div class="panel">No hay proyectos registrados en esta área.</div>';

  projects.forEach((project) => {
    const node =
      $("#project-template").content.cloneNode(true);

    const card =
      node.querySelector(".project-card");

    const value = progress(project);

    let details =
      `${value.done}/${value.total} pasos`;

    if (project.due_date) {
      details += ` · Término: ${formatDate(
        project.due_date
      )}`;
    }

    if (project.status === "standby") {
      const standbyArea =
        state.areas.find(
          (area) =>
            area.id === project.standby_area_id
        )?.name || "Sin definir";

      details += ` · En espera por ${standbyArea}`;
    }

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

    status.classList.add(project.status);

    card.querySelector("h2").textContent =
      project.title;

    card.querySelector(
      ".progress-number"
    ).textContent =
      `${value.percent}%`;

    card.querySelector(
      ".project-meta"
    ).textContent =
      `Responsable: ${
        project.profiles?.full_name ||
        "Sin asignar"
      }`;

    card.querySelector(
      ".progress i"
    ).style.width =
      `${value.percent}%`;

    card.querySelector(
      ".card-info"
    ).textContent = details;

    let standbyInfo = "";

    if (project.status === "standby") {
      standbyInfo = `
        <div class="step">
          <span>⏸</span>

          <label>
            Solicitado por:
            ${escapeHtml(
              project.standby_requested_by ||
                "No registrado"
            )}

            <small>
              Área responsable:
              ${escapeHtml(
                state.areas.find(
                  (area) =>
                    area.id ===
                    project.standby_area_id
                )?.name || ""
              )}
            </small>

            <small>
              Motivo:
              ${escapeHtml(
                project.standby_reason ||
                  "Sin información"
              )}
            </small>

            <small>
              Contacto:
              ${escapeHtml(
                project.standby_contact ||
                  "No registrado"
              )}
            </small>

            <small>
              Cómo continuar:
              ${escapeHtml(
                project.standby_resume_instructions ||
                  "Sin instrucciones"
              )}
            </small>
          </label>
        </div>
      `;
    }

    card.querySelector(".steps").innerHTML =
      standbyInfo +
      project.project_steps
        .map(
          (step) => `
            <div class="step ${
              step.is_completed
                ? "done"
                : ""
            }">

              <span>
                ${
                  step.is_completed
                    ? "✓"
                    : "○"
                }
              </span>

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

            </div>
          `
        )
        .join("");

    container.append(node);
  });
}

$("#area-filter").addEventListener(
  "change",
  (event) => {
    state.activeArea =
      event.target.value;

    render();
  }
);

clock();

setInterval(clock, 1000);

load();