// Exécute les migrations SQL au démarrage
const fs   = require('fs');
const path = require('path');
const db   = require('./index');

async function runMigrations() {
  // Créer la table de suivi des migrations
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query(
      'SELECT 1 FROM _migrations WHERE name=$1', [file]
    );
    if (rows.length) continue; // déjà appliquée

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await db.query(sql);
      await db.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`[migrate] ✓ ${file}`);
    } catch (e) {
      console.error(`[migrate] ✗ ${file}: ${e.message}`);
    }
  }
}

module.exports = runMigrations;
