// Notifications push (Web Push / VAPID). Inactif tant que VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ne sont pas définies.
// Ne lève jamais d'exception : une notification ratée ne doit jamais casser un paiement ou une signature.
const webpush = require('web-push');
const db = require('../db');

const enabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let configured = false;
function setup() {
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@finalise.fr', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    configured = true;
  }
}

// payload : { title, body, url } — envoyé à tous les appareils du pro ; les abonnements expirés (404/410) sont supprimés
async function sendToPro(proId, payload) {
  if (!enabled()) return { skipped: 'no-vapid' };
  try {
    setup();
    const { rows } = await db.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE pro_id=$1', [proId]);
    let sent = 0;
    await Promise.all(rows.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await db.query('DELETE FROM push_subscriptions WHERE id=$1', [s.id]);
        else console.error('[push]', e.statusCode || '', e.message);
      }
    }));
    return { sent };
  } catch (e) { console.error('[push]', e.message); return { error: e.message }; }
}

module.exports = { enabled, sendToPro };
