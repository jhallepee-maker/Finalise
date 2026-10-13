require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const runMigrations = require('./db/migrate');
const app          = express();

// Appliquer les migrations au démarrage
runMigrations().catch(e => console.error('[migrate] erreur:', e.message));

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Webhook Stripe doit recevoir le body RAW — monter AVANT express.json()
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/stripeWebhook')
);

app.use(express.json());

// Routes
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/devis',   require('./routes/devis'));
app.use('/api/paiement',require('./routes/paiement'));
app.use('/api/stripe',  require('./routes/stripe'));

app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Finalise backend → port ${PORT}`));
