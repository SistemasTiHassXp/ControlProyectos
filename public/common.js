import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const escapeHtml = (value = "") =>
    String(value).replace(
        /[&<>'"]/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;"
            })[char]
    );

export const formatDate = (value) =>
    value
        ? new Intl.DateTimeFormat("es-PE", {
              dateStyle: "medium"
          }).format(new Date(`${value}T12:00:00`))
        : "Sin fecha estimada";

export const formatDateTime = (value) =>
    value
        ? new Intl.DateTimeFormat("es-PE", {
              dateStyle: "medium",
              timeStyle: "short"
          }).format(new Date(value))
        : "";

export function progress(project) {
    const steps = project.project_steps || [];

    const done = steps.filter(
        (step) => step.is_completed
    ).length;

    return {
        done,
        total: steps.length,
        percent: steps.length
            ? Math.round((done * 100) / steps.length)
            : 0
    };
}

export function getProjectStatus(project) {
    switch (project.status) {
        case "standby":
            return "En espera";

        case "completed":
            return "Completado";

        case "delayed":
            return "Retrasado";

        default:
            return "Activo";
    }
}

export function getAreaName(areas, areaId) {
    return (
        areas.find(
            (area) => area.id === areaId
        )?.name || "Sin área"
    );
}

export async function client() {
    const config = await fetch("/api/config").then(
        (response) => response.json()
    );

    if (
        !config.supabaseUrl ||
        !config.anonKey
    ) {
        throw new Error(
            "Faltan las claves de Supabase en Render."
        );
    }

    return createClient(
        config.supabaseUrl,
        config.anonKey
    );
}

export async function profileFor(
    supabase
) {
    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
        return {
            session: null,
            profile: null
        };
    }

    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

    if (error) {
        throw new Error(
            "Tu cuenta no tiene un perfil configurado."
        );
    }

    return {
        session,
        profile
    };
}

export async function signOut(
    supabase
) {
    await supabase.auth.signOut();

    location.href = "/";
}

export async function attachApiAuth(
    supabase
) {
    if (window.__apiAuthAttached) {
        return;
    }

    window.__apiAuthAttached = true;

    const originalFetch =
        window.fetch.bind(window);

    window.fetch = async (
        input,
        init = {}
    ) => {
        try {
            const {
                data: { session }
            } =
                await supabase.auth.getSession();

            const url =
                typeof input === "string"
                    ? input
                    : input.url;

            if (
                url.startsWith("/api/") &&
                session?.access_token
            ) {
                init.headers = {
                    ...(init.headers || {}),
                    Authorization: `Bearer ${session.access_token}`
                };
            }
        } catch (error) {
            console.error(error);
        }

        return originalFetch(
            input,
            init
        );
    };
}