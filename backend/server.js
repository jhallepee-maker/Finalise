require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const runMigrations = require('./db/migrate');
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
app.use('/api/devis',   require('./routes/devis'));
app.use('/api/paiement',require('./routes/paiement'));
app.use('/api/stripe',  require('./routes/stripe'));

app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Finalise backend → port ${PORT}`));
