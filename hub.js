/* ============================================================
   5D BUDGETING — Conexión con el BIM Hub Visor (repo 96)
   Revit publica los modelos (IFC) al BIM Hub en Cloudflare; desde aquí se
   listan esos proyectos y se descarga el IFC para presupuestarlo.
   - El BIM Hub tiene su propio login (Google, proyecto Firebase lifecity-bim-hub),
     distinto al de 5D: se abre como una segunda sesión ("bimhub") en este navegador.
   - Solo lectura: /api/me, /api/p/<link>, /api/p/<link>/file
   API: window.HUB
   ============================================================ */
window.HUB = (function () {
  const FB = 'https://www.gstatic.com/firebasejs/10.12.5/';
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyALlDZKaooZHCGmo_b1dcPVU83ZEO0MSYo',
    authDomain: 'lifecity-bim-hub.firebaseapp.com',
    projectId: 'lifecity-bim-hub',
    storageBucket: 'lifecity-bim-hub.firebasestorage.app',
    messagingSenderId: '1089992266025',
    appId: '1:1089992266025:web:68276ccbdefae6f050e738'
  };
  let base = 'https://bim-hub-visor.lifecity.workers.dev';

  // Solo en localhost: probar contra `wrangler dev` (localStorage hub.base / hub.dev = correo)
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  let dev = null;
  if (isLocal) {
    try {
      base = localStorage.getItem('hub.base') || base;
      dev = localStorage.getItem('hub.dev') || null;
    } catch (e) {}
  }

  let A = null, auth = null, user = null, initP = null;

  function init() {
    if (initP) return initP;
    initP = (async () => {
      if (dev) { user = { email: dev, name: dev.split('@')[0] }; return; }
      const appMod = await import(FB + 'firebase-app.js');
      A = await import(FB + 'firebase-auth.js');
      const app = appMod.initializeApp(FIREBASE_CONFIG, 'bimhub');
      auth = A.getAuth(app);
      await new Promise((res) => {
        let first = true;
        A.onAuthStateChanged(auth, (u) => {
          user = u ? { email: u.email, name: u.displayName || u.email } : null;
          if (first) { first = false; res(); }
        });
      });
    })();
    return initP;
  }

  async function token() {
    await init();
    if (dev) return 'dev:' + dev;
    if (!auth || !auth.currentUser) { const e = new Error('Conéctate al BIM Hub con tu cuenta de Google.'); e.code = 'hub/sin-sesion'; throw e; }
    return auth.currentUser.getIdToken();
  }

  async function api(path) {
    let r;
    try { r = await fetch(base + path, { headers: { Authorization: 'Bearer ' + (await token()) } }); }
    catch (e) { if (e.code) throw e; throw new Error('Sin conexión con el BIM Hub.'); }
    let body = null;
    try { body = await r.json(); } catch (e) {}
    if (!r.ok) {
      const msg = r.status === 403 ? 'No tienes acceso a ese proyecto en el BIM Hub.'
        : r.status === 404 ? 'Ese proyecto no existe en el BIM Hub.'
        : (body && body.error) || ('HTTP ' + r.status);
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return body;
  }

  return {
    init,
    get base() { return base; },
    get user() { return user; },

    /* Abre el login de Google del BIM Hub */
    async connect() {
      await init();
      if (dev) return user;
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/unauthorized-domain') throw new Error('Este dominio aún no está autorizado en el BIM Hub (Firebase → Authentication → Authorized domains).');
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw new Error('Se cerró la ventana de Google.');
        if (e.code === 'auth/popup-blocked') throw new Error('El navegador bloqueó la ventana de Google; permite las ventanas emergentes.');
        throw e;
      }
      const u = auth.currentUser;
      user = u ? { email: u.email, name: u.displayName || u.email } : null;
      return user;
    },
    async disconnect() {
      await init();
      if (auth && auth.currentUser) await A.signOut(auth);
      if (!dev) user = null;
    },

    /* Proyectos del BIM Hub que ve esta cuenta → [{slug,name,share_id,models?,role?}] */
    async projects() { return (await api('/api/me')).projects || []; },

    /* Detalle de un proyecto: modelos publicados (IFC) → {name,slug,share_id,models:[{id,name,file_key,size,updated_at}]} */
    project(share) { return api('/api/p/' + encodeURIComponent(share)); },

    /* Acepta el link completo (…/p/<código>) o solo el código */
    shareFromLink(s) {
      s = String(s || '').trim();
      const m = s.match(/\/p\/([\w-]+)/);
      if (m) return m[1];
      return /^[\w-]{6,}$/.test(s) ? s : '';
    },
    link(share) { return base + '/p/' + share; },

    /* Descarga el IFC → ArrayBuffer. onProgress(bytes, total) */
    async download(share, key, onProgress) {
      const r = await fetch(base + '/api/p/' + encodeURIComponent(share) + '/file?key=' + encodeURIComponent(key),
        { headers: { Authorization: 'Bearer ' + (await token()) } });
      if (!r.ok) {
        const e = new Error(r.status === 404 ? 'El modelo ya no está en el BIM Hub (¿se volvió a publicar con otro nombre?).'
          : r.status === 403 ? 'No tienes acceso a ese proyecto en el BIM Hub.' : 'HTTP ' + r.status);
        e.status = r.status; throw e;
      }
      const total = Number(r.headers.get('Content-Length') || 0);
      if (!r.body || !onProgress) return r.arrayBuffer();
      const reader = r.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        onProgress(got, total);
      }
      const out = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    }
  };
})();
