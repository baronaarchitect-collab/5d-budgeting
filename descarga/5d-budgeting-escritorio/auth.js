/* ============================================================
   5D BUDGETING — Autenticación LOCAL (solo este navegador)
   Cuentas y proyectos viven en localStorage. NO es seguridad de
   servidor: sirve para separar los proyectos por usuario en el
   mismo equipo. Las contraseñas se guardan con hash SHA-256 + sal.
   ============================================================ */
window.AUTH = (function () {
  const USERS_KEY = 'budgeting5d_users';
  const SESS_KEY  = 'budgeting5d_session';

  function readJSON(k, def) { try { return JSON.parse(localStorage.getItem(k) || '') ?? def; } catch (e) { return def; } }
  function users() { return readJSON(USERS_KEY, {}) || {}; }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  function normEmail(e) { return String(e || '').trim().toLowerCase(); }

  async function hash(pass, salt) {
    const data = new TextEncoder().encode(salt + '::' + pass);
    try {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // fallback (contextos sin crypto.subtle, p.ej. file://): djb2 — menos seguro
      let h = 5381; const s = salt + '::' + pass;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return 'djb2$' + h.toString(16);
    }
  }

  function randSalt() {
    try { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return String(Date.now()) + Math.random().toString(36).slice(2); }
  }

  function current() { return localStorage.getItem(SESS_KEY) || ''; }
  function currentUser() { const u = users()[current()]; return u ? { email: current(), ...u } : null; }

  async function signup(email, name, pass) {
    email = normEmail(email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Correo no válido');
    if (!name || name.trim().length < 2) throw new Error('Escribe tu nombre');
    if (!pass || pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
    const u = users();
    if (u[email]) throw new Error('Ya existe una cuenta con ese correo — inicia sesión');
    const salt = randSalt();
    u[email] = { name: name.trim(), salt, pass: await hash(pass, salt), createdAt: new Date().toISOString() };
    saveUsers(u);
    localStorage.setItem(SESS_KEY, email);
    migrateLegacyProjects();
    return currentUser();
  }

  async function login(email, pass) {
    email = normEmail(email);
    const u = users()[email];
    if (!u) throw new Error('No hay ninguna cuenta con ese correo');
    const h = await hash(pass, u.salt);
    if (h !== u.pass) throw new Error('Contraseña incorrecta');
    localStorage.setItem(SESS_KEY, email);
    return currentUser();
  }

  function logout() { localStorage.removeItem(SESS_KEY); }

  function projectsKey() { return 'budgeting5d_projects__' + current(); }

  // Migra los proyectos del namespace global antiguo al primer usuario que entre.
  function migrateLegacyProjects() {
    try {
      const legacy = localStorage.getItem('budgeting5d_projects');
      if (!legacy) return;
      const key = projectsKey();
      if (localStorage.getItem(key)) return; // el usuario ya tiene proyectos
      localStorage.setItem(key, legacy);
      localStorage.removeItem('budgeting5d_projects');
    } catch (e) {}
  }

  // Protege una página: si no hay sesión, redirige al login guardando el destino.
  function guard() {
    if (!current()) {
      const next = location.pathname.split('/').pop() + location.search;
      location.replace('login.html?next=' + encodeURIComponent(next));
      return false;
    }
    return true;
  }

  return { users, currentUser, current, signup, login, logout, projectsKey, guard, migrateLegacyProjects };
})();
