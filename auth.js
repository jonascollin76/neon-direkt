(function () {
  const config = window.SUPABASE_CONFIG || {};

  const authView = document.querySelector('#authView');
  const authForm = document.querySelector('#authForm');
  const authTitle = document.querySelector('#authTitle');
  const authMessage = document.querySelector('#authMessage');
  const authSubmit = document.querySelector('#authSubmit');
  const authReset = document.querySelector('#authReset');
  const authSwitch = document.querySelector('#authSwitch');
  const authDemo = document.querySelector('#authDemo');

  const profileReset = document.querySelector('#profileReset');

  const passwordView = document.querySelector('#passwordView');
  const passwordForm = document.querySelector('#passwordForm');
  const passwordMessage = document.querySelector('#passwordMessage');
  const passwordSubmit = document.querySelector('#passwordSubmit');

  const app = document.querySelector('.app-shell');

  let signUpMode = false;
  let client = null;
  let saveTimer = null;

  window.profileUserEmail = '';

  // =========================================================
  // SUPABASE CONFIG
  // =========================================================

  function configured() {
    return (
      config.url &&
      config.anonKey &&
      !config.url.startsWith('INDSAET_') &&
      !config.anonKey.startsWith('INDSAET_')
    );
  }

  // =========================================================
  // PUBLIC WEBSITE URL
  // =========================================================

  function getRedirectUrl() {
    return 'https://jonascollin76.github.io/neon-direkt/';
  }

  // =========================================================
  // AUTH UI
  // =========================================================

  function showApp() {
    if (authView) authView.hidden = true;

    if (app) {
      app.classList.remove('auth-locked');
    }
  }

  function showAuth() {
    if (authView) authView.hidden = false;

    if (app) {
      app.classList.add('auth-locked');
    }
  }

  function setMessage(text, error = false) {
    if (!authMessage) return;

    authMessage.textContent = text;
    authMessage.classList.toggle('error', error);
  }

  function updateMode() {
    if (!authTitle || !authSubmit || !authSwitch) return;

    authTitle.textContent = signUpMode
      ? 'Opret profil'
      : 'Log ind';

    authSubmit.textContent = signUpMode
      ? 'OPRET PROFIL'
      : 'LOG IND';

    authSwitch.textContent = signUpMode
      ? 'Har du allerede en profil? Log ind'
      : 'Ny spiller? Opret profil';
  }

  // =========================================================
  // LOAD GAME SAVE
  // =========================================================

  async function loadSave(userId) {
    if (!client || !userId) return;

    const { data, error } = await client
      .from('game_saves')
      .select('save_data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Kunne ikke hente spillet:', error.message);
      return;
    }

    const localSave = localStorage.getItem(
      `neon-district-save:${userId}`
    );

    // Supabase save findes
    if (data && window.applyGameSaveData) {
      window.applyGameSaveData(data.save_data);

      localStorage.setItem(
        `neon-district-save:${userId}`,
        JSON.stringify(data.save_data)
      );

      return;
    }

    // Ellers brug lokal save
    if (localSave && window.applyGameSaveData) {
      try {
        window.applyGameSaveData(JSON.parse(localSave));
      } catch (error) {
        console.error('Kunne ikke læse lokal game save:', error);
      }
    }
  }

  // =========================================================
  // SAVE GAME
  // =========================================================

  async function saveGame() {
    if (!client) return;
    if (!window.getGameSaveData) return;

    try {
      const {
        data: sessionData,
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) {
        console.error(
          'Kunne ikke hente session:',
          sessionError.message
        );
        return;
      }

      const session = sessionData.session;

      if (!session || !session.user) return;

      const user = session.user;
      const saveData = window.getGameSaveData();

      // Lokal backup
      localStorage.setItem(
        `neon-district-save:${user.id}`,
        JSON.stringify(saveData)
      );

      // Gem i Supabase
      const { error } = await client
        .from('game_saves')
        .upsert(
          {
            user_id: user.id,
            save_data: saveData,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'user_id'
          }
        );

      if (error) {
        console.error(
          'Kunne ikke gemme spillet:',
          error.message
        );
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  }

  // =========================================================
  // PASSWORD RESET
  // =========================================================

  async function sendPasswordReset(email) {
    if (!client) {
      return setMessage(
        'Supabase er ikke konfigureret korrekt.',
        true
      );
    }

    if (!email) {
      return setMessage(
        'Skriv din e-mail først.',
        true
      );
    }

    const redirectUrl = getRedirectUrl();

    const { error } = await client.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: redirectUrl
      }
    );

    if (error) {
      setMessage(error.message, true);
    } else {
      setMessage(
        'Tjek din e-mail for et link til ny adgangskode.'
      );
    }
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  window.logoutSupabase = async function () {
    if (!client) return;

    try {
      await saveGame();

      const { error } = await client.auth.signOut();

      if (error) {
        console.error(
          'Logout fejl:',
          error.message
        );
        return;
      }

      window.profileUserEmail = '';

      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // =========================================================
  // RESET PASSWORD BUTTON
  // =========================================================

  window.resetSupabasePassword = function () {
    sendPasswordReset(
      window.profileUserEmail
    );
  };

  // =========================================================
  // ACTIVATE SESSION
  // =========================================================

  async function activateSession(session) {
    if (!session || !session.user) {
      window.profileUserEmail = '';
      return;
    }

    window.profileUserEmail =
      session.user.email || '';

    // Opdater profil UI hvis den findes
    if (window.renderProfile) {
      window.renderProfile();
    }

    // Hent spillerens save
    await loadSave(session.user.id);
  }

  // =========================================================
  // GAME SAVE EVENTS
  // =========================================================

  window.addEventListener(
    'game-state-changed',
    function () {
      clearTimeout(saveTimer);

      saveTimer = setTimeout(
        saveGame,
        700
      );
    }
  );

  // Gem når browseren lukkes
  window.addEventListener(
    'beforeunload',
    function () {
      saveGame();
    }
  );

  // Backup save hvert 10. sekund
  setInterval(
    saveGame,
    10000
  );

  // =========================================================
  // SWITCH LOGIN / SIGNUP
  // =========================================================

  if (authSwitch) {
    authSwitch.addEventListener(
      'click',
      function () {
        signUpMode = !signUpMode;
        updateMode();
        setMessage('');
      }
    );
  }

  // =========================================================
  // PASSWORD RESET
  // =========================================================

  if (authReset) {
    authReset.addEventListener(
      'click',
      function () {
        const emailInput =
          document.querySelector('#authEmail');

        const email =
          emailInput
            ? emailInput.value.trim()
            : '';

        sendPasswordReset(email);
      }
    );
  }

  if (profileReset) {
    profileReset.addEventListener(
      'click',
      function () {
        window.resetSupabasePassword();
      }
    );
  }

  // =========================================================
  // NEW PASSWORD
  // =========================================================

  if (passwordForm) {
    passwordForm.addEventListener(
      'submit',
      async function (event) {
        event.preventDefault();

        if (!client) return;

        if (passwordSubmit) {
          passwordSubmit.disabled = true;
        }

        const passwordInput =
          document.querySelector('#newPassword');

        const newPassword =
          passwordInput
            ? passwordInput.value
            : '';

        if (!newPassword || newPassword.length < 6) {
          if (passwordMessage) {
            passwordMessage.textContent =
              'Adgangskoden skal være mindst 6 tegn.';
            passwordMessage.classList.add('error');
          }

          if (passwordSubmit) {
            passwordSubmit.disabled = false;
          }

          return;
        }

        const { error } =
          await client.auth.updateUser({
            password: newPassword
          });

        if (passwordSubmit) {
          passwordSubmit.disabled = false;
        }

        if (error) {
          if (passwordMessage) {
            passwordMessage.textContent =
              error.message;

            passwordMessage.classList.add(
              'error'
            );
          }

          return;
        }

        if (passwordMessage) {
          passwordMessage.textContent =
            'Adgangskoden er ændret.';

          passwordMessage.classList.remove(
            'error'
          );
        }

        if (passwordView) {
          passwordView.hidden = true;
        }

        showApp();
      }
    );
  }

  // =========================================================
  // DEMO MODE
  // =========================================================

  if (authDemo) {
    authDemo.addEventListener(
      'click',
      function () {
        showApp();
        setMessage('');
      }
    );
  }

  // =========================================================
  // LOGIN / SIGNUP
  // =========================================================

  if (authForm) {
    authForm.addEventListener(
      'submit',
      async function (event) {
        event.preventDefault();

        if (!client) {
          return setMessage(
            'Supabase er ikke konfigureret korrekt.',
            true
          );
        }

        if (authSubmit) {
          authSubmit.disabled = true;
        }

        const emailInput =
          document.querySelector('#authEmail');

        const passwordInput =
          document.querySelector('#authPassword');

        const email =
          emailInput
            ? emailInput.value.trim()
            : '';

        const password =
          passwordInput
            ? passwordInput.value
            : '';

        if (!email || !password) {
          if (authSubmit) {
            authSubmit.disabled = false;
          }

          return setMessage(
            'Udfyld både e-mail og adgangskode.',
            true
          );
        }

        let result;

        try {
          // =========================================
          // CREATE ACCOUNT
          // =========================================

          if (signUpMode) {
            result = await client.auth.signUp({
              email: email,
              password: password,

              options: {
                emailRedirectTo:
                  getRedirectUrl()
              }
            });

          // =========================================
          // LOGIN
          // =========================================

          } else {
            result =
              await client.auth.signInWithPassword({
                email: email,
                password: password
              });
          }

        } catch (error) {
          if (authSubmit) {
            authSubmit.disabled = false;
          }

          return setMessage(
            error.message ||
              'Der opstod en fejl.',
            true
          );
        }

        if (authSubmit) {
          authSubmit.disabled = false;
        }

        // Supabase fejl
        if (result.error) {
          return setMessage(
            result.error.message,
            true
          );
        }

        // =========================================
        // EMAIL CONFIRMATION
        // =========================================

        if (
          signUpMode &&
          !result.data.session
        ) {
          return setMessage(
            'Profilen er oprettet! Tjek din e-mail og bekræft din konto.'
          );
        }

        // =========================================
        // SUCCESS
        // =========================================

        if (result.data.session) {
          showApp();

          await activateSession(
            result.data.session
          );

          setMessage('');
        }
      }
    );
  }

  // =========================================================
  // CHECK SUPABASE CONFIG
  // =========================================================

  if (!configured()) {
    showAuth();

    setMessage(
      'Supabase er ikke konfigureret. Kontrollér supabase-config.js.',
      true
    );

    updateMode();

    return;
  }

  // =========================================================
  // CHECK SUPABASE LIBRARY
  // =========================================================

  if (!window.supabase) {
    showAuth();

    setMessage(
      'Supabase-biblioteket kunne ikke indlæses.',
      true
    );

    return;
  }

  // =========================================================
  // CREATE SUPABASE CLIENT
  // =========================================================

  client = window.supabase.createClient(
    config.url,
    config.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // =========================================================
  // CHECK CURRENT SESSION
  // =========================================================

  client.auth
    .getSession()
    .then(async function ({ data, error }) {
      if (error) {
        console.error(
          'Session error:',
          error.message
        );

        showAuth();

        setMessage(
          error.message,
          true
        );

        return;
      }

      if (data.session) {
        showApp();

        await activateSession(
          data.session
        );

      } else {
        showAuth();
      }
    })
    .catch(function (error) {
      console.error(
        'Auth initialization error:',
        error
      );

      showAuth();

      setMessage(
        error.message ||
          'Kunne ikke starte login.',
        true
      );
    });

  // =========================================================
  // AUTH STATE CHANGES
  // =========================================================

  client.auth.onAuthStateChange(
    async function (event, session) {

      console.log(
        'Supabase auth event:',
        event
      );

      // Password reset
      if (event === 'PASSWORD_RECOVERY') {
        if (passwordView) {
          passwordView.hidden = false;
        }

        if (authView) {
          authView.hidden = true;
        }

        return;
      }

      // Logged in
      if (session) {
        showApp();

        await activateSession(
          session
        );

        return;
      }

      // Logged out
      showAuth();

      window.profileUserEmail = '';

      if (window.renderProfile) {
        window.renderProfile();
      }
    }
  );

  // =========================================================
  // INITIAL UI
  // =========================================================

  updateMode();

})();
