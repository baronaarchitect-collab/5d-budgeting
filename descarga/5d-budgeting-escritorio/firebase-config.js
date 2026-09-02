/* ============================================================
   CONFIG DE FIREBASE  —  PEGA AQUÍ la de TU proyecto.
   Firebase Console → ⚙ Configuración del proyecto → "Tus apps"
   → app Web → SDK setup and configuration → Config.
   (Estos valores son públicos por diseño; la seguridad la dan
    las Reglas de Firestore, ver firestore.rules)
   Mientras tengan "PEGA_…", la app funciona en modo LOCAL.
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: "PEGA_TU_API_KEY",
  authDomain: "PEGA_TU_PROYECTO.firebaseapp.com",
  projectId: "PEGA_TU_PROYECTO",
  storageBucket: "PEGA_TU_PROYECTO.appspot.com",
  messagingSenderId: "PEGA_TU_SENDER_ID",
  appId: "PEGA_TU_APP_ID"
};
