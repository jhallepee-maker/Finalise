require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const runMigrations = require('./db/migrate');
const db           = require('./db');
const app          = express();

// Appliquer les migrations au démarrage
runMigrations().catch(e => console.error('[migrate] erreur:', e.message));

// Derrière le proxy Railway : nécessaire pour que le rate-limit voie la vraie IP client
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Webhook Stripe doit recevoir le body RAW — monter AVANT express.json() (et avant les limiteurs)
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/stripeWebhook')
);

app.use(express.json({ limit: '100kb' }));

// Limiteurs : connexion/inscription strict, endpoints publics (liens clients) plus souple
const limiter = (windowMs, max) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques instants.' },
});
app.use('/api/auth',     limiter(15 * 60 * 1000, 30));
app.use('/api/paiement', limiter(60 * 1000, 40));
app.use('/api/stripe/create-payment-intent', limiter(60 * 1000, 20));
app.use('/api/devis/token', limiter(60 * 1000, 60));

// Routes
app.use('/api/auth',    require('./routes/auth'));
// Lecture seule du profil du guide (nom, CGV, TVA) pour préparer ses devis ; toute modification reste personnelle
const actAs = require('./middleware/actAs');
app.use('/api/profil',  (req, res, next) => (req.method === 'GET' ? actAs(req, res, next) : next()), require('./routes/profil'));
app.use('/api/devis',   actAs, require('./routes/devis'));
app.use('/api/push',    require('./routes/push'));
app.use('/api/org',     require('./routes/org'));
app.use('/api/paiement',require('./routes/paiement'));
app.use('/api/stripe',  require('./routes/stripe'));
app.use('/api/assurance', require('./routes/assurance'));

app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

// Surveillance : /health reste léger (Railway) ; /health/db vérifie la base (à brancher sur un moniteur d'uptime)
app.get('/health/db', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok', db: 'ok' }); }
  catch (e) { console.error(JSON.stringify({ level: 'error', where: 'health/db', msg: e.message })); res.status(503).json({ status: 'down', db: 'down' }); }
});

// Erreurs non rattrapées par les routes : JSON invalide → 400, le reste → 500 journalisé (une ligne JSON, sans corps de requête)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse' });
  console.error(JSON.stringify({ level: 'error', method: req.method, path: req.path, msg: err.message, stack: String(err.stack || '').split('\n').slice(0, 4).join(' | ') }));
  res.status(500).json({ error: 'Erreur serveur' });
});
process.on('unhandledRejection', r => console.error(JSON.stringify({ level: 'error', where: 'unhandledRejection', msg: String(r && r.message || r) })));

module.exports = app; // importable par les tests

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Finalise backend → port ${PORT}`));
}
