// Mode bureau : un admin ou une secrétaire peut agir sur les DEVIS d'un guide de son organisation
// via l'en-tête X-Act-As: <id du guide>. Sans l'en-tête, rien ne change. Monté uniquement sur /api/devis
// (jamais sur profil, CGV ni Stripe : ces réglages restent personnels à chaque guide).
const jwt = require('jsonwebtoken');
const db = require('../db');

module.exports = async function actAs(req, res, next) {
  const target = req.headers['x-act-as'];
  if (!target) return next();
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
    const me = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    if (String(target) === String(me.id)) return next();
    const { rows } = await db.query(
      `SELECT c.org_role AS caller_role, t.id, t.email, t.org_role AS target_role
         FROM pros c JOIN pros t ON t.org_id = c.org_id
        WHERE c.id=$1 AND t.id::text=$2 AND c.org_id IS NOT NULL`, [me.id, String(target)]);
    const r = rows[0];
    if (!r || !['admin', 'secretaire'].includes(r.caller_role) || !['guide', 'admin'].includes(r.target_role))
      return res.status(403).json({ error: "Vous n'êtes pas autorisé à agir pour ce guide" });
    req.headers.authorization = 'Bearer ' + jwt.sign({ id: r.id, email: r.email, actor: me.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
};
