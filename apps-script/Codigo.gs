/**
 * 5D BUDGETING — Webhook de Wompi en Google Apps Script (GRATIS)
 * Activa `pro: true` en Firestore cuando Wompi confirma un pago APROBADO.
 *
 * Alternativa sin costo a Cloud Functions (que exige plan Blaze).
 * Setup completo en README.md de esta carpeta.
 */

// ====================== CONFIGURA ESTO ======================
const FIREBASE_PROJECT_ID = 'd-budgeting-18a11';

// Súbele el número cada vez que edites este archivo. Luego abre la URL /exec en el
// navegador: si ves este mismo número, la versión desplegada YA es la nueva.
const VERSION = 2;

// Días de Pro que otorga cada pago (suscripción mensual).
const DIAS_POR_PAGO = 30;
const ZONA = 'America/Bogota';

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

    const hasta = activarPro(uid, tx);
    registrar('PRO_ACTIVADO', { uid: uid, email: email, txId: tx.id, monto: tx.amount_in_cents, proHasta: hasta });
    return salida({ ok: true, uid: uid });

  } catch (err) {
    registrar('ERROR', { error: String(err) });
    return salida({ ok: false, error: String(err) });
  }
}

/** Para probar en el navegador que el webhook está vivo. */
function doGet() {
  return salida({
    ok: true,
    servicio: '5D Budgeting · webhook Wompi',
    proyecto: FIREBASE_PROJECT_ID,
    version: VERSION,                       // <- compara con el VERSION de tu código
    firmaValidada: !!WOMPI_EVENTS_SECRET,   // false = aún no pusiste el secreto de Wompi
    reenviosConfigurados: REENVIAR_A.length,
    diasPorPago: DIAS_POR_PAGO
  });
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
/** Lee el documento users/{uid} y devuelve sus campos (o null). */
function leerUsuario(uid) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents/users/' + uid;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + tokenAcceso() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) return null;
  const d = JSON.parse(res.getContentText());
  return (d && d.fields) ? d.fields : null;
}

/**
 * Activa/renueva Pro sumando DIAS_POR_PAGO.
 * Si aún le queda vigencia, se ACUMULA (paga antes de vencer y no pierde días).
 */
function activarPro(uid, tx) {
  const campos = leerUsuario(uid);
  const ahora = new Date();
  let desde = ahora;
  if (campos && campos.proHasta && campos.proHasta.stringValue) {
    const actual = new Date(campos.proHasta.stringValue + 'T23:59:59');
    if (!isNaN(actual.getTime()) && actual > ahora) desde = actual;
  }
  const hasta = new Date(desde.getTime() + DIAS_POR_PAGO * 24 * 60 * 60 * 1000);
  const proHasta = Utilities.formatDate(hasta, ZONA, 'yyyy-MM-dd');

  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents/users/' + uid +
              '?updateMask.fieldPaths=pro&updateMask.fieldPaths=proHasta' +
              '&updateMask.fieldPaths=proSince' +
              '&updateMask.fieldPaths=lastPaymentId&updateMask.fieldPaths=lastPaymentAmount';
  const cuerpo = {
    fields: {
      pro: { booleanValue: true },
      proHasta: { stringValue: proHasta },
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
  return proHasta;
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

/**
 * OPCIONAL — Recordatorio de vencimiento.
 * Avisa por correo a quien le queden DIAS_AVISO días de Pro.
 * Para activarlo: en Apps Script → ⏰ Activadores → Añadir activador →
 * función `recordatorioVencimientos`, basado en tiempo, cada día.
 */
const DIAS_AVISO = 3;
const URL_RENOVAR = 'https://baronaarchitect-collab.github.io/5d-budgeting/comprar.html';

function recordatorioVencimientos() {
  const objetivo = Utilities.formatDate(
    new Date(Date.now() + DIAS_AVISO * 24 * 60 * 60 * 1000), ZONA, 'yyyy-MM-dd');

  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents:runQuery';
  const cuerpo = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'proHasta' }, op: 'EQUAL', value: { stringValue: objetivo } } }
    }
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + tokenAcceso() },
    payload: JSON.stringify(cuerpo), muteHttpExceptions: true
  });
  const arr = JSON.parse(res.getContentText());
  let enviados = 0;
  for (let i = 0; i < arr.length; i++) {
    const doc = arr[i].document;
    if (!doc || !doc.fields) continue;
    const correo = doc.fields.email && doc.fields.email.stringValue;
    const nombre = (doc.fields.name && doc.fields.name.stringValue) || '';
    if (!correo) continue;
    try {
      MailApp.sendEmail({
        to: correo,
        subject: 'Tu Pro de 5D Budgeting vence en ' + DIAS_AVISO + ' días',
        htmlBody: 'Hola ' + nombre + ',<br><br>Tu plan <b>Pro</b> vence el <b>' + objetivo + '</b>.<br>' +
                  'Para no perder el acceso a subir tus APUs, guardar APUs en tu cuenta y cotizar con proveedores, ' +
                  'renuévalo aquí:<br><br><a href="' + URL_RENOVAR + '">Renovar mi Pro</a><br><br>— 5D Budgeting · LifeCity'
      });
      enviados++;
    } catch (e) { registrar('AVISO_ERROR', { correo: correo, error: String(e) }); }
  }
  registrar('AVISOS_ENVIADOS', { fecha: objetivo, enviados: enviados });
}

/** ---- Utilidades para probar a mano desde el editor ---- */

// Activa Pro manualmente para un correo (útil para el pago que ya hiciste).
function activarProManualPorCorreo() {
  const CORREO = 'pon_aqui@el-correo.com';   // <-- cámbialo y ejecuta esta función
  const uid = buscarUidPorCorreo(CORREO.toLowerCase().trim());
  if (!uid) throw new Error('No se encontró usuario con ese correo');
  const hasta = activarPro(uid, { id: 'manual', amount_in_cents: 0 });
  console.log('✓ Pro activado para ' + CORREO + ' (uid ' + uid + ') hasta el ' + hasta);
}

// Comprueba que la cuenta de servicio y Firestore responden.
function probarConexion() {
  const t = tokenAcceso();
  console.log('Token OK, longitud ' + t.length);
}
