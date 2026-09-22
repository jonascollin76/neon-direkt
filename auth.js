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

  function configured() {
    return config.url && config.anonKey && !config.url.startsWith('INDSAET_') && !config.anonKey.startsWith('INDSAET_');
  }

  function showApp() {
    authView.hidden = true;
    app.classList.remove('auth-locked');
  }

  function showAuth() {
    authView.hidden = false;
    app.classList.add('auth-locked');
  }

  function setMessage(text, error = false) {
    authMessage.textContent = text;
    authMessage.classList.toggle('error', error);
  }

  function updateMode() {
    authTitle.textContent = signUpMode ? 'Opret profil' : 'Log ind';
    authSubmit.textContent = signUpMode ? 'OPRET PROFIL' : 'LOG IND';
    authSwitch.textContent = signUpMode ? 'Har du allerede en profil? Log ind' : 'Ny spiller? Opret profil';
  }

  async function loadSave(userId) {
    const { data, error } = await client.from('game_saves').select('save_data').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const localSave = localStorage.getItem(`neon-district-save:${userId}`);
    if (data && window.applyGameSaveData) {
      window.applyGameSaveData(data.save_data);
      localStorage.setItem(`neon-district-save:${userId}`, JSON.stringify(data.save_data));
    } else if (localSave && window.applyGameSaveData) {
      window.applyGameSaveData(JSON.parse(localSave));
    }
  }

  async function saveGame() {
    if (!client) return;
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData.session && sessionData.session.user;
    if (!user || !window.getGameSaveData) return;
    const saveData = window.getGameSaveData();
    localStorage.setItem(`neon-district-save:${user.id}`, JSON.stringify(saveData));
    const { error } = await client.from('game_saves').upsert({ user_id: user.id, save_data: saveData, updated_at: new Date().toISOString() });
    if (error) console.error('Kunne ikke gemme spillet:', error.message);
  }

  async function sendPasswordReset(email) {
    if (!client) return setMessage('Konfigurér Supabase først i supabase-config.js.', true);
    if (!email) return setMessage('Skriv din e-mail først.', true);
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    setMessage(error ? error.message : 'Tjek din e-mail for et link til ny adgangskode.', Boolean(error));
  }

  window.logoutSupabase = async () => {
    if (!client) return;
    await client.auth.signOut();
    window.profileUserEmail = '';
    window.location.reload();
  };
  window.resetSupabasePassword = () => sendPasswordReset(window.profileUserEmail);

  async function activateSession(session) {
    window.profileUserEmail = session && session.user ? session.user.email || '' : '';
    if (window.renderProfile) window.renderProfile();
    if (session) await loadSave(session.user.id);
  }

  window.addEventListener('game-state-changed', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveGame, 700);
  });
    window.addEventListener('beforeunload', saveGame);
    setInterval(saveGame, 1000);

  authSwitch.addEventListener('click', () => { signUpMode = !signUpMode; updateMode(); });
  authReset.addEventListener('click', () => sendPasswordReset(document.querySelector('#authEmail').value));
  profileReset.addEventListener('click', () => window.resetSupabasePassword());
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    passwordSubmit.disabled = true;
    const { error } = await client.auth.updateUser({ password: document.querySelector('#newPassword').value });
    passwordSubmit.disabled = false;
    if (error) { passwordMessage.textContent = error.message; passwordMessage.classList.add('error'); return; }
    passwordView.hidden = true;
    showApp();
    setMessage('Adgangskoden er ændret.');
  });
  authDemo.addEventListener('click', () => { showApp(); setMessage(''); });
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client) return setMessage('Konfigurér Supabase først i supabase-config.js.', true);
    authSubmit.disabled = true;
    const email = document.querySelector('#authEmail').value;
    const password = document.querySelector('#authPassword').value;
    const result = signUpMode
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });
    authSubmit.disabled = false;
    if (result.error) return setMessage(result.error.message, true);
    if (signUpMode && !result.data.session) return setMessage('Tjek din e-mail for at bekræfte profilen.');
    showApp();
    await activateSession(result.data.session);
    setMessage('');
  });

  if (!configured() || !window.supabase) {
    setMessage('Indsæt Supabase URL og anon key i supabase-config.js, eller fortsæt uden login.', true);
    return;
  }

  client = window.supabase.createClient(config.url, config.anonKey);
  client.auth.getSession().then(async ({ data }) => {
    if (data.session) {
      showApp();
      await activateSession(data.session);
    } else {
      showAuth();
    }
  }).catch((error) => setMessage(error.message, true));
  client.auth.onAuthStateChange((_event, session) => { if (_event === 'PASSWORD_RECOVERY') { passwordView.hidden = false; authView.hidden = true; return; } if (session) { showApp(); activateSession(session); } });
  updateMode();
}());