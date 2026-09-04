# Activar Pro automáticamente con Google Apps Script (gratis)

Cuando alguien paga en Wompi, Wompi envía un **evento** a una URL tuya. Este Apps Script
recibe ese evento, verifica la firma y escribe `pro: true` en Firestore para ese usuario.

Es la alternativa **gratuita** a Cloud Functions (que exige plan Blaze).

---

## 1) Crear la cuenta de servicio de Firebase (2 min)
1. Consola Firebase → ⚙ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → descarga un archivo `.json`.
3. Ábrelo y copia dos valores:
   - `client_email`  → va en `SA_EMAIL`
   - `private_key`   → va en `SA_PRIVATE_KEY` (todo el bloque, con los `\n`)

> Esa clave da acceso de administrador a tu Firestore. **No la subas a GitHub.**
> Solo va dentro del proyecto de Apps Script (es privado).

## 2) Crear el Apps Script (3 min)
1. Entra a **https://script.google.com** → **Nuevo proyecto**.
2. Borra el contenido y pega todo el archivo **`Codigo.gs`** de esta carpeta.
3. Arriba del archivo completa:
   - `FIREBASE_PROJECT_ID` → ya viene con `d-budgeting-18a11`
   - `SA_EMAIL` y `SA_PRIVATE_KEY` → los del paso 1
   - `WOMPI_EVENTS_SECRET` → lo llenas en el paso 4 (déjalo vacío por ahora)
4. Guarda (💾).
5. Ejecuta la función **`probarConexion`** una vez. Google te pedirá **autorizar** los
   permisos: acepta. Debe imprimir "Token OK…" en los registros.

## 3) Publicarlo como Web App
1. Botón **Implementar → Nueva implementación**.
2. Tipo: ⚙ → **Aplicación web**.
3. Configura:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario** ← imprescindible para que Wompi pueda llamarla
4. **Implementar** → copia la **URL de la aplicación web**
   (`https://script.google.com/macros/s/XXXXX/exec`).
5. Ábrela en el navegador: debe responder un JSON `{"ok":true,...}`.

## 4) Conectar Wompi
1. Panel de **Wompi → Configuración → Eventos**.
2. Pega la URL del paso 3 como **URL de eventos**.
3. Copia el **secreto de eventos** que te muestra Wompi y ponlo en
   `WOMPI_EVENTS_SECRET` dentro del Apps Script → guarda → **Implementar → Editar
   implementación → Nueva versión** (importante: cada cambio necesita nueva versión).

## 4-bis) ¿Ya tenías otra URL de eventos?

Wompi admite **una sola URL de eventos por ambiente** (una para pruebas y otra para
producción); no es una lista. Si pones la del Apps Script, la anterior deja de recibir.

Solución: deja la del Apps Script como única URL en Wompi y dile que **reenvíe** el evento
a la tuya anterior. En `Codigo.gs`:

```js
const REENVIAR_A = [
  'https://tu-otra-url.com/webhook-wompi',
];
```

El evento se reenvía **tal cual** (mismo cuerpo y content-type), así que la firma de Wompi
sigue siendo válida en el otro extremo y ese sistema no nota diferencia. Puedes poner
varias URLs. En **Ejecuciones** verás una línea `REENVIADO` con el código de respuesta de
cada una. Si un reenvío falla, no afecta la activación de Pro.

> Si lo que tenías era la URL de **otro ambiente** (pruebas vs producción), no hay conflicto:
> cada ambiente tiene su propio campo y su propio secreto.

### Si tu URL anterior TAMBIÉN es un Apps Script
Tienes dos caminos:

**A. Dos scripts + reenvío (recomendado, riesgo cero).**
Dejas el script viejo intacto, en el nuevo pones su URL en `REENVIAR_A`, y en Wompi
configuras la URL del script nuevo. El viejo sigue recibiendo todo igual.

**B. Un solo script.** Pegas las funciones de este archivo dentro del proyecto viejo,
pero **renombra `doPost`** para que no choque con el que ya existe, y llámalo desde el
`doPost` original:

```js
// en el doPost que YA tienes, agrega al principio:
function doPost(e) {
  try { activarProWompi(e); } catch (err) { console.log('pro: ' + err); }

  // ...aquí sigue TODO tu código actual, sin tocar...
}

// y pega este archivo renombrando su doPost a:
function activarProWompi(e) { /* el cuerpo del doPost de este archivo */ }
```
Con B no tienes que cambiar nada en Wompi (la URL sigue siendo la misma).

> ⚠️ **Nunca** pongas la URL real de tus webhooks (ni el secreto de Wompi, ni la clave de
> la cuenta de servicio) en archivos del repo: este repositorio es **público**. Esos
> valores van solo dentro del editor de Apps Script.

## 5) Que el pago se asocie a la cuenta correcta
El script busca al usuario por el **correo** con el que se pagó en Wompi.
Por eso la página de compra le muestra al usuario:
> *"Paga usando este correo para que Pro se active automáticamente: …"*

Si alguien paga con otro correo, el evento queda registrado como `SIN_USUARIO`
(lo ves en Apps Script → **Ejecuciones**) y lo activas a mano con la función
`activarProManualPorCorreo` (cambia el correo dentro de la función y ejecútala).

## 6) Cerrar la puerta (recomendado, al final)
Con el webhook funcionando, cambia las reglas de Firestore a la versión estricta
(está comentada dentro de `firestore.rules`) para que **el usuario no pueda
auto-activarse Pro** — solo la cuenta de servicio podrá escribir `pro`.

---

## Tu caso: el pago que ya hiciste
Como el webhook aún no existía, ese pago no activó nada. Dos opciones:

- **Rápido:** en el Apps Script, edita `activarProManualPorCorreo` con el correo de esa
  cuenta y ejecútala.
- **O manual:** Consola Firebase → Firestore → colección `users` → busca el documento de
  ese usuario → campo `pro` → cámbialo a `true`.

## Probar que funciona
En el panel de Wompi puedes reenviar un evento de prueba, o hacer un pago con el link de
pruebas. Luego revisa **Apps Script → Ejecuciones**: debe aparecer `PRO_ACTIVADO`.
En la app, el usuario pulsa **"Ya pagué — verificar"** y Pro queda activo.
