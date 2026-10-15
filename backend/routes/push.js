const express = require('express');
const db = require('../db');
const push = require('../lib/push');
const { verifyJWT } = require('../middleware/auth');
const { HttpError, handle } = require('../lib/httpError');
const router = express.Router();

// GET /api/push/key — clé publique VAPID (null si les push ne sont pas configurés)
router.get('/key', (req, res) => res.json({ key: push.enabled() ? process.env.VAPID_PUBLIC_KEY : null }));

// POST /api/push/subscribe — enregistre l'appareil du pro connecté
router.post('/subscribe', verifyJWT, handle(async (req, res) => {
  const s = req.body && req.body.subscription;
  const ep = s && s.endpoint, k = s && s.keys;
  if (!ep || !/^https:\/\//.test(ep) || !k || !k.p256dh || !k.auth) throw new HttpError(400, 'Abonnement invalide');
  await db.query(
    `INSERT INTO push_subscriptions (pro_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET pro_id=EXCLUDED.pro_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [req.user.id, String(ep).slice(0, 1000), String(k.p256dh).slice(0, 200), String(k.auth).slice(0, 100), String(req.headers['user-agent'] || '').slice(0, 255)]);
  res.status(201).json({ ok: true });
}));

// DELETE /api/push/subscribe {endpoint}
router.delete('/subscribe', verifyJWT, handle(async (req, res) => {
  await db.query('DELETE FROM push_subscriptions WHERE pro_id=$1 AND endpoint=$2', [req.user.id, String(req.body && req.body.endpoint || '')]);
  res.json({ ok: true });
}));

// POST /api/push/test — envoie une notification d'essai à mes appareils
router.post('/test', verifyJWT, handle(async (req, res) => {
  if (!push.enabled()) throw new HttpError(503, 'Notifications non configurées');
  const r = await push.sendToPro(req.user.id, { title: 'Finalise', body: 'Les notifications fonctionnent ✓', url: '/' });
  res.json(r);
}));

module.exports = router;
