/**
 * Cloud Function (opcional) — Webhook de eventos de Wompi.
 * Cuando un pago queda APROBADO, marca pro:true en el usuario que compró.
 *
 * Requisitos:
 *  - Plan Blaze en Firebase (las Functions necesitan facturación).
 *  - firebase deploy --only functions
 *  - En Wompi: configura la URL de "Eventos" apuntando a esta función:
 *       https://<region>-<projectId>.cloudfunctions.net/wompiWebhook
 *  - Guarda el secreto de eventos de Wompi:
 *       firebase functions:config:set wompi.events_secret="TU_SECRETO_DE_EVENTOS"
 *
 * Mapear pago -> usuario: crea el "Link de pago" de Wompi con una REFERENCIA que
 * contenga el UID (o el correo) del comprador, o pide el correo en el checkout.
 * Aquí se intenta por customer_email y por la reference.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
admin.initializeApp();
const db = admin.firestore();

exports.wompiWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");
    const evt = req.body || {};

    // 1) Verificar la firma del evento (checksum) que envía Wompi.
    const secret = (functions.config().wompi && functions.config().wompi.events_secret) || "";
    if (secret && evt.signature && evt.signature.properties) {
      const props = evt.signature.properties; // p.ej. ["transaction.id","transaction.status","transaction.amount_in_cents"]
      const ts = evt.timestamp;
      let concat = "";
      for (const p of props) {
        concat += p.split(".").reduce((o, k) => (o ? o[k] : undefined), evt.data);
      }
      concat += ts + secret;
      const checksum = crypto.createHash("sha256").update(concat).digest("hex").toUpperCase();
      if (checksum !== String(evt.signature.checksum || "").toUpperCase()) {
        console.warn("Firma inválida en evento Wompi");
        return res.status(401).send("bad signature");
      }
    }

    // 2) Solo transacciones aprobadas
    const tx = evt.data && evt.data.transaction;
    if (!tx || tx.status !== "APPROVED") return res.status(200).send("ignored");

    // 3) Identificar al comprador: por reference (recomendado: UID) o por email
    const reference = tx.reference || "";
    const email = (tx.customer_email || "").toLowerCase();

    let uid = null;
    // a) si la reference ES el uid
    if (reference && /^[A-Za-z0-9_-]{20,}$/.test(reference)) uid = reference;
    // b) si no, buscar por email en users
    if (!uid && email) {
      const q = await db.collection("users").where("email", "==", email).limit(1).get();
      if (!q.empty) uid = q.docs[0].id;
    }
    if (!uid) { console.warn("No se pudo mapear el pago a un usuario", { reference, email }); return res.status(200).send("no user"); }

    // 4) Marcar Pro
    await db.collection("users").doc(uid).set({
      pro: true,
      proSince: new Date().toISOString(),
      lastPaymentId: tx.id,
      lastPaymentAmount: tx.amount_in_cents
    }, { merge: true });

    console.log("Pro activado para", uid);
    return res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    return res.status(500).send("error");
  }
});
