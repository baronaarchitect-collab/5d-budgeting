# 5D Budgeting · Convertirlo en SaaS con Firebase + Wompi

La app corre 100% en el navegador (GitHub Pages). Con Firebase le agregas **cuentas
reales**, **proyectos en la nube por usuario** (multi‑dispositivo) y **estado Pro por
usuario**. El pago se cobra con un **link de Wompi**. Sin backend propio.

> Mientras no configures Firebase, la app sigue funcionando en **modo local** (cuentas y
> proyectos en este navegador). No se rompe nada.

## 1) Crear el proyecto Firebase (5 min)
1. Entra a https://console.firebase.google.com → **Agregar proyecto**.
2. Crea una **app Web** (ícono `</>`) y copia el objeto **firebaseConfig**.
3. Pega esos valores en **`firebase-config.js`** (reemplaza los `PEGA_…`).

## 2) Activar Authentication
1. Console → **Build → Authentication → Get started**.
2. Habilita **Correo electrónico/contraseña**. (Opcional: **Google**.)
3. **Authentication → Settings → Authorized domains**: agrega
   `baronaarchitect-collab.github.io` (y `localhost` para pruebas).

## 3) Activar Firestore
1. Console → **Build → Firestore Database → Create database** (modo producción).
2. Pestaña **Rules** → pega el contenido de **`firestore.rules`** → **Publish**.
   - Empiezas con activación de Pro "por confianza". Para producción (que nadie se
     auto‑active Pro), usa el bloque comentado de reglas + el webhook (paso 5).

## 4) Cobro con Wompi (link de pago)
1. Panel de **Wompi → Links de pago → Crear** un link para "5D Budgeting Pro".
2. Copia la URL (`https://checkout.wompi.co/l/XXXXX`) y pégala en **`comprar.html`**,
   objeto `PAGO.link`. Ajusta `PAGO.precioCOP` (solo la etiqueta).
3. Listo: el botón **"Pagar con Wompi"** abre tu link. Tras pagar, el comprador pulsa
   **"Ya pagué"** y se marca **Pro** en su cuenta.

## 5) (Recomendado) Activación automática y verificada — Cloud Function
Para que Pro se active **solo cuando Wompi confirma el pago** (y nadie pueda auto‑activarse):
1. Necesitas **plan Blaze** (facturación) en Firebase.
2. `npm i -g firebase-tools && firebase login && firebase init functions` (elige este proyecto).
3. Usa el código de **`functions/index.js`** (webhook `wompiWebhook`).
4. Guarda el secreto de eventos de Wompi:
   `firebase functions:config:set wompi.events_secret="TU_SECRETO"`
5. `firebase deploy --only functions` → copia la URL de la función.
6. En **Wompi → Configuración → Eventos**, pega esa URL.
7. Crea los links de Wompi con una **referencia = UID** del comprador (o pide el correo),
   para mapear el pago a la cuenta.
8. Cambia las reglas de Firestore al **modo producción** (bloque comentado) para que solo
   la función (admin) pueda escribir `pro`.

## Modelo de datos (Firestore)
```
users/{uid}                      { email, name, pro, createdAt }
users/{uid}/projects/{projectId} { nombre, savedAt, totales…, data:"<json del proyecto>" }
users/{uid}/meta/apubase         { data:"<json de la base APU propia>" }
```

## Archivos clave
- `firebase-config.js` — tu config (pégala).
- `saas.js` — capa Auth + Firestore (con fallback local).
- `login.html` / `dashboard.html` — acceso y panel por usuario.
- `comprar.html` — link de Wompi + activación Pro.
- `firestore.rules` — seguridad por usuario.
- `functions/` — webhook de Wompi (opcional, para activación verificada).
