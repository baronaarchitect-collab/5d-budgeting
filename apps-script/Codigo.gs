/**
 * 5D BUDGETING — Webhook de Wompi en Google Apps Script (GRATIS)
 * Activa `pro: true` en Firestore cuando Wompi confirma un pago APROBADO.
 *
 * Alternativa sin costo a Cloud Functions (que exige plan Blaze).
 * Setup completo en README.md de esta carpeta.
 */

// ====================== CONFIGURA ESTO ======================
const FIREBASE_PROJECT_ID = 'd-budgeting-18a11';

// Secreto de EVENTOS de Wompi (Panel Wompi → Configuración → Eventos).
// Si lo dejas vacío, NO se valida la firma (úsalo solo para probar).
const WOMPI_EVENTS_SECRET = '';

// Cuenta de servicio de Firebase (Consola Firebase → Configuración del proyecto
// → Cuentas de servicio → Generar nueva clave privada). Del JSON descargado:
const SA_EMAIL = 'PEGA_client_email_DEL_JSON';
const SA_PRIVATE_KEY = 'PEGA_private_key_DEL_JSON';  // incluye -----BEGIN PRIVATE KEY----- ... y los \n

// ¿Ya tenías OTRA URL de eventos en Wompi? Wompi solo admite UNA por ambiente,
// así que ponla aquí y este script le reenvía cada evento tal cual (sin tocarlo),
// para que siga funcionando igual que antes. Puedes poner varias.
const REENVIAR_A = [
  // 'https://tu-otra-url.com/webhook-wompi',
];
// ============================================================

/** Wompi hace POST aquí con cada evento. */
function doPost(e) {
  // Primero reenviamos a tus otras URLs (si las hay), pase lo que pase después.
  reenviar(e);
  try {
    const evt = JSON.parse(e.postData.contents);

    if (!verificarFirma(evt)) return salida({ ok: false, error: 'firma inválida' });

    const tx = evt.data && evt.data.transaction;
    if (!tx) return salida({ ok: true, skip: 'sin transacción' });
    if (tx.status !== 'APPROVED') return salida({ ok: true, skip: 'estado ' + tx.status });

    const email = String(tx.customer_email || '').toLowerCase().trim();
    const ref   = String(tx.reference || '').trim();

    // 1) si la referencia es directamente el UID, se usa; 2) si no, se busca por correo
    let uid = /^[A-Za-z0-9]{20,}$/.test(ref) ? ref : null;
    if (!uid && email) uid = buscarUidPorCorreo(email);

    if (!uid) {
      registrar('SIN_USUARIO', { email: email, reference: ref, txId: tx.id });
      return salida({ ok: false, error: 'no se encontró usuario para ' + email });
    }

    activarPro(uid, tx);
    registrar('PRO_ACTIVADO', { uid: uid, email: email, txId: tx.id, monto: tx.amount_in_cents });
    return salida({ ok: true, uid: uid });

  } catch (err) {
    registrar('ERROR', { error: String(err) });
    return salida({ ok: false, error: String(err) });
  }
}

/** Para probar en el navegador que el webhook está vivo. */
function doGet() {
  return salida({ ok: true, servicio: '5D Budgeting · webhook Wompi', proyecto: FIREBASE_PROJECT_ID });
}

/** Valida el checksum SHA-256 que envía Wompi. */
function verificarFirma(evt) {
  if (!WOMPI_EVENTS_SECRET) return true; // sin secreto configurado: no se valida
  try {
    const props = evt.signature.properties;
    let cadena = '';
    for (let i = 0; i < props.length; i++) {
      cadena += props[i].split('.').reduce(function (o, k) { return o ? o[k] : ''; }, evt.data);
    }
    cadena += evt.timestamp + WOMPI_EVENTS_SECRET;
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cadena, Utilities.Charset.UTF_8);
    let hex = '';
    for (let j = 0; j < bytes.length; j++) hex += ('0' + (bytes[j] & 0xff).toString(16)).slice(-2);
    return hex.toUpperCase() === String(evt.signature.checksum || '').toUpperCase();
  } catch (e) { return false; }
}

/** Token OAuth de la cuenta de servicio (scope Firestore). */
function tokenAcceso() {
  const ahora = Math.floor(Date.now() / 1000);
  const b64 = function (o) { return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, ''); };
  const sinFirmar = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: ahora + 3600, iat: ahora
  });
  const firma = Utilities.computeRsaSha256Signature(sinFirmar, SA_PRIVATE_KEY.replace(/\n/g, '\n'));
  const jwt = sinFirmar + '.' + Utilities.base64EncodeWebSafe(firma).replace(/=+$/, '');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  const d = JSON.parse(res.getContentText());
  if (!d.access_token) throw new Error('No se obtuvo token: ' + res.getContentText());
  return d.access_token;
}

/** Busca el UID en la colección users por el campo email. */
function buscarUidPorCorreo(email) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents:runQuery';
  const cuerpo = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } },
      limit: 1
    }
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + tokenAcceso() },
    payload: JSON.stringify(cuerpo), muteHttpExceptions: true
  });
  const arr = JSON.parse(res.getContentText());
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].document) {
      const partes = arr[i].document.name.split('/');
      return partes[partes.length - 1];
    }
  }
  return null;
}

/** Marca pro:true en users/{uid}. */
function activarPro(uid, tx) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents/users/' + uid +
              '?updateMask.fieldPaths=pro&updateMask.fieldPaths=proSince' +
              '&updateMask.fieldPaths=lastPaymentId&updateMask.fieldPaths=lastPaymentAmount';
  const cuerpo = {
    fields: {
      pro: { booleanValue: true },
      proSince: { stringValue: new Date().toISOString() },
      lastPaymentId: { stringValue: String(tx.id || '') },
      lastPaymentAmount: { integerValue: String(tx.amount_in_cents || 0) }
    }
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + tokenAcceso() },
    payload: JSON.stringify(cuerpo), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('Firestore: ' + res.getContentText());
}

/**
 * Reenvía el evento ORIGINAL (mismo cuerpo y content-type) a otras URLs.
 * Como se manda intacto, la firma de Wompi sigue siendo válida allá.
 */
function reenviar(e) {
  if (!REENVIAR_A || !REENVIAR_A.length) return;
  try {
    const peticiones = REENVIAR_A.map(function (url) {
      return {
        url: url,
        method: 'post',
        contentType: (e.postData && e.postData.type) || 'application/json',
        payload: (e.postData && e.postData.contents) || '',
        muteHttpExceptions: true
      };
    });
    const res = UrlFetchApp.fetchAll(peticiones);
    for (let i = 0; i < res.length; i++) {
      registrar('REENVIADO', { url: REENVIAR_A[i], codigo: res[i].getResponseCode() });
    }
  } catch (err) {
    registrar('REENVIO_ERROR', { error: String(err) });
  }
}

/** Deja rastro en los Registros de Apps Script (Ver → Ejecuciones). */
function registrar(tipo, datos) {
  console.log(tipo + ' ' + JSON.stringify(datos));
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ---- Utilidades para probar a mano desde el editor ---- */

// Activa Pro manualmente para un correo (útil para el pago que ya hiciste).
function activarProManualPorCorreo() {
  const CORREO = 'pon_aqui@el-correo.com';   // <-- cámbialo y ejecuta esta función
  const uid = buscarUidPorCorreo(CORREO.toLowerCase().trim());
  if (!uid) throw new Error('No se encontró usuario con ese correo');
  activarPro(uid, { id: 'manual', amount_in_cents: 0 });
  console.log('✓ Pro activado para ' + CORREO + ' (uid ' + uid + ')');
}

// Comprueba que la cuenta de servicio y Firestore responden.
function probarConexion() {
  const t = tokenAcceso();
  console.log('Token OK, longitud ' + t.length);
}
