const jwt = require('jsonwebtoken');
const db = require('../db');

async function verifyJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }
  try {
    // un compte supprimé ne doit plus pouvoir utiliser un jeton encore valide
    const { rows } = await db.query('SELECT deleted_at FROM pros WHERE id=$1', [req.user.id]);
    if (rows[0] && rows[0].deleted_at) return res.status(401).json({ error: 'Compte supprimé' });
  } catch { /* en cas d'erreur BDD, les routes échoueront d'elles-mêmes */ }
  next();
}

module.exports = { verifyJWT };
