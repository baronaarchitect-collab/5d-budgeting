/* ============================================================
   5D BUDGETING — Capa SaaS (Firebase Auth + Firestore)
   - Si firebase-config.js tiene una config real  -> modo "firebase"
     (cuentas reales multi-dispositivo, proyectos en la nube por usuario,
      estado Pro por usuario).
   - Si no                                          -> modo "local"
     (delega en auth.js + localStorage; el sitio sigue funcionando).
   API única para todas las páginas: window.SAAS
   ============================================================ */
window.SAAS = (function () {
  const FB = 'https://www.gstatic.com/firebasejs/10.12.5/';
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && !/PEGA|TU_/.test(cfg.apiKey) && cfg.projectId && !/PEGA|TU_/.test(cfg.projectId));
  const state = { mode: configured ? 'firebase' : 'local', user: null, profile: null };
  let A = null, F = null, auth = null, db = null;

  function localUser() {
    const u = window.AUTH && AUTH.currentUser ? AUTH.currentUser() : null;
    return u ? { uid: u.email, email: u.email, displayName: u.name } : null;
  }

  async function ensureProfile(u) {
    try {
      const ref = F.doc(db, 'users', u.uid);
      const snap = await F.getDoc(ref);
      if (!snap.exists()) {
        const p = { email: u.email || '', name: u.displayName || '', pro: false, createdAt: new Date().toISOString() };
        await F.setDoc(ref, p);
        state.profile = p;
      } else {
        state.profile = snap.data();
      }
    } catch (e) { state.profile = null; }
  }

  const ready = (async () => {
    if (!configured) { state.user = localUser(); return; }
    try {
      const appMod = await import(FB + 'firebase-app.js');
      A = await import(FB + 'firebase-auth.js');
      F = await import(FB + 'firebase-firestore.js');
      const app = appMod.initializeApp(cfg);
      auth = A.getAuth(app);
      db = F.getFirestore(app);
      await new Promise((res) => {
        let first = true;
        A.onAuthStateChanged(auth, async (u) => {
          state.user = u || null;
          if (u) { try { await ensureProfile(u); } catch (e) {} }
          else state.profile = null;
          if (first) { first = false; res(); }
        });
      });
    } catch (e) {
      console.warn('SaaS/Firebase no disponible, modo local:', e && e.message);
      state.mode = 'local';
      state.user = localUser();
    }
  })();

  function cacheKey(uid) { return 'budgeting5d_projects__' + (uid || 'local'); }

  return {
    ready,
    get mode() { return state.mode; },
    get configured() { return state.mode === 'firebase'; },
    get uid() { return state.user ? state.user.uid : ''; },
    get user() { return state.user; },
    currentName() { return state.user ? (state.user.displayName || (state.profile && state.profile.name) || state.user.email || '') : ''; },

    isPro() {
      if (state.mode === 'firebase') return !!(state.profile && state.profile.pro) || localStorage.getItem('budgeting5d_pro') === '1';
      return !!(window.APP_CONFIG && APP_CONFIG.pro) || localStorage.getItem('budgeting5d_pro') === '1';
    },
    async setPro(v) {
      try { localStorage.setItem('budgeting5d_pro', v ? '1' : '0'); } catch (e) {}
      if (state.mode === 'firebase' && state.user) {
        try { await F.setDoc(F.doc(db, 'users', state.user.uid), { pro: !!v }, { merge: true }); if (state.profile) state.profile.pro = !!v; } catch (e) {}
      }
    },

    async signupEmail(email, name, pass) {
      if (state.mode === 'local') { const u = await AUTH.signup(email, name, pass); state.user = { uid: u.email, email: u.email, displayName: u.name }; return; }
      const cred = await A.createUserWithEmailAndPassword(auth, String(email).trim(), pass);
      if (name) { try { await A.updateProfile(cred.user, { displayName: name }); } catch (e) {} }
      state.user = cred.user; await ensureProfile({ uid: cred.user.uid, email: cred.user.email, displayName: name });
    },
    async loginEmail(email, pass) {
      if (state.mode === 'local') { const u = await AUTH.login(email, pass); state.user = { uid: u.email, email: u.email, displayName: u.name }; return; }
      const cred = await A.signInWithEmailAndPassword(auth, String(email).trim(), pass);
      state.user = cred.user; await ensureProfile(cred.user);
    },
    async loginGoogle() {
      if (state.mode !== 'firebase') throw new Error('Inicia sesión con Google disponible cuando Firebase está configurado');
      const prov = new A.GoogleAuthProvider();
      const cred = await A.signInWithPopup(auth, prov);
      state.user = cred.user; await ensureProfile(cred.user);
    },
    async resetPassword(email) {
      if (state.mode !== 'firebase') throw new Error('Recuperar contraseña disponible con Firebase configurado');
      await A.sendPasswordResetEmail(auth, String(email).trim());
    },
    async logout() {
      if (state.mode === 'local') { if (window.AUTH) AUTH.logout(); state.user = null; return; }
      try { await A.signOut(auth); } catch (e) {}
      state.user = null;
    },

    guard() {
      if (!state.user) {
        const next = location.pathname.split('/').pop() + location.search;
        location.replace('login.html?next=' + encodeURIComponent(next));
        return false;
      }
      return true;
    },

    projectsCacheKey() { return cacheKey(this.uid); },

    async listProjects() {
      if (state.mode === 'local') {
        try { return JSON.parse(localStorage.getItem(this.projectsCacheKey()) || '{}'); } catch (e) { return {}; }
      }
      const out = {};
      try {
        const col = F.collection(db, 'users', state.user.uid, 'projects');
        const qs = await F.getDocs(col);
        qs.forEach((d) => {
          const v = d.data();
          out[d.id] = {
            id: d.id, nombre: v.nombre, savedAt: v.savedAt,
            presupuesto: { totalDirecto: v.totalDirecto || 0, totalIndirecto: v.totalIndirecto || 0 },
            actividadesIfc: new Array(v.nActs || 0), materiales: new Array(v.nMats || 0),
            model: { fileName: v.modelo || '' }
          };
        });
      } catch (e) { console.warn('listProjects', e); }
      return out;
    },
    async getProject(id) {
      if (state.mode === 'local') {
        try { const m = JSON.parse(localStorage.getItem(this.projectsCacheKey()) || '{}'); return m[id] || null; } catch (e) { return null; }
      }
      try {
        const snap = await F.getDoc(F.doc(db, 'users', state.user.uid, 'projects', id));
        if (!snap.exists()) return null;
        const v = snap.data();
        return v.data ? JSON.parse(v.data) : v;
      } catch (e) { return null; }
    },
    async saveProject(id, data) {
      try { const k = this.projectsCacheKey(); const m = JSON.parse(localStorage.getItem(k) || '{}'); m[id] = data; localStorage.setItem(k, JSON.stringify(m)); } catch (e) {}
      if (state.mode !== 'firebase' || !state.user) return;
      try {
        await F.setDoc(F.doc(db, 'users', state.user.uid, 'projects', id), {
          nombre: data.nombre || id, savedAt: data.savedAt || new Date().toISOString(),
          totalDirecto: (data.presupuesto && data.presupuesto.totalDirecto) || 0,
          totalIndirecto: (data.presupuesto && data.presupuesto.totalIndirecto) || 0,
          nActs: (data.actividadesIfc && data.actividadesIfc.length) || 0,
          nMats: (data.materiales && data.materiales.length) || 0,
          modelo: (data.model && data.model.fileName) || '',
          data: JSON.stringify(data)
        });
      } catch (e) { console.warn('saveProject', e); }
    },
    async deleteProject(id) {
      try { const k = this.projectsCacheKey(); const m = JSON.parse(localStorage.getItem(k) || '{}'); delete m[id]; localStorage.setItem(k, JSON.stringify(m)); } catch (e) {}
      if (state.mode !== 'firebase' || !state.user) return;
      try { await F.deleteDoc(F.doc(db, 'users', state.user.uid, 'projects', id)); } catch (e) {}
    },

    /* Base APU propia del usuario en la nube (opcional) */
    async saveApuBaseCloud(arr) {
      if (state.mode !== 'firebase' || !state.user) return false;
      try { await F.setDoc(F.doc(db, 'users', state.user.uid, 'meta', 'apubase'), { data: JSON.stringify(arr), updatedAt: new Date().toISOString() }); return true; } catch (e) { return false; }
    },
    async loadApuBaseCloud() {
      if (state.mode !== 'firebase' || !state.user) return null;
      try { const s = await F.getDoc(F.doc(db, 'users', state.user.uid, 'meta', 'apubase')); return s.exists() ? JSON.parse(s.data().data) : null; } catch (e) { return null; }
    }
  };
})();
