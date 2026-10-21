import {
    client,
    profileFor
} from './common.js';

const supabase = await client();

const $ = (selector) =>
    document.querySelector(selector);

const form = $('#login-form');

const errorBox = $('#form-error');
const destination = (profile) =>
    profile.role === 'admin'
        ? '/admin.html'
        : ['manager', 'executive'].includes(profile.role)
            ? '/index.html'
            : '/workspace.html';

async function createSessionControls() {
    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
        return;
    }

    try {
        const { profile } =
            await profileFor(supabase);

        const controls =
            document.createElement('div');

        controls.className =
            'session-controls';

        const continueButton =
            document.createElement('button');

        continueButton.type = 'button';

        continueButton.className =
            'button';

        continueButton.textContent =
            `Continuar como ${profile.full_name}`;

        continueButton.addEventListener(
            'click',
            () => {
                location.href = destination(profile);
            }
        );

        const signOutButton =
            document.createElement('button');

        signOutButton.type = 'button';

        signOutButton.className =
            'button ghost';

        signOutButton.textContent =
            'Cerrar sesión actual';

        signOutButton.addEventListener(
            'click',
            async () => {
                await supabase.auth.signOut();

                alert(
                    'Sesión cerrada. Puedes iniciar sesión con otra cuenta.'
                );

                location.reload();
            }
        );

        controls.appendChild(
            continueButton
        );

        controls.appendChild(
            signOutButton
        );

        form.parentNode.insertBefore(
            controls,
            form.nextSibling
        );
    } catch (error) {
        console.error(
            'Error al cargar el perfil:',
            error
        );
    }
}

form.addEventListener(
    'submit',
    async (event) => {
        event.preventDefault();

        errorBox.textContent = '';

        const submitButton =
            form.querySelector(
                'button[type="submit"]'
            );

        submitButton.disabled = true;

        submitButton.textContent =
            'Validando...';

        const controller =
            new AbortController();

        const slowRequestTimer =
            setTimeout(
                () => {
                    submitButton.textContent =
                        'Activando servidor...';

                    errorBox.textContent =
                        'El servidor gratuito de Render se está activando. La primera solicitud puede tardar hasta 60 segundos.';
                },
                12000
            );

        const requestTimeout =
            setTimeout(
                () => controller.abort(),
                75000
            );

        try {
            const formData =
                new FormData(event.currentTarget);

            const response = await fetch(
                '/api/auth/login',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    signal: controller.signal,

                    body: JSON.stringify({
                        username:
                            formData.get(
                                'username'
                            ),

                        password:
                            formData.get(
                                'password'
                            )
                    })
                }
            );

            const data =
                await response.json().catch(
                    () => ({})
                );

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Usuario o contraseña incorrectos.'
                );
            }

            const { error } =
                await supabase.auth.setSession({
                    access_token:
                        data.session.access_token,

                    refresh_token:
                        data.session.refresh_token
                });

            if (error) {
                throw error;
            }

            const { profile } =
                await profileFor(supabase);

            location.href = destination(profile);
        } catch (error) {
            console.error(
                'Error al iniciar sesión:',
                error
            );

            errorBox.textContent =
                error.name === 'AbortError'
                    ? 'El servidor no respondió después de 75 segundos. Revisa las variables de Render y vuelve a intentarlo.'
                    : error.message ||
                      'No se pudo conectar con el servidor. Intenta nuevamente.';
        } finally {
            clearTimeout(slowRequestTimer);

            clearTimeout(requestTimeout);

            submitButton.disabled = false;

            submitButton.textContent =
                'Ingresar';
        }
    }
);

await createSessionControls();
