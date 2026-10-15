# Finalise

Plateforme de finalisation de paiements pour indépendants français.

**Flux :** Pro crée un devis → envoie un lien unique → client signe + paie → les deux reçoivent la preuve archivée.

## Stack
- **Backend :** Node.js / Express + PostgreSQL (Railway)
- **Frontend :** React PWA (Vercel) → Capacitor iOS/Android
- **Paiements :** Stripe Connect Express
- **Signature :** électronique (eIDAS / Code Civil art. 1366-1367)

## Structure
```
Finalise/
  backend/      ← Express API
    routes/     ← auth, devis, paiement, stripe
    middleware/ ← JWT
    db/         ← pool PostgreSQL + schema.sql
  frontend/     ← React PWA (à venir)
```

## Lancer en local
```bash
cd backend
cp .env.example .env  # remplir les vars
npm install
npm run dev
```

## Assurance annulation (Meetch) — désactivée par défaut
Variables Railway : `MEETCH_ENABLED=1`, `MEETCH_API_KEY` (Bearer), `MEETCH_BASE_URL` (sans /v1, pré-prod : `https://api.preprod.ticketing.meetch.io`), `MEETCH_PRODUCT_ID`, `MEETCH_WEBHOOK_SECRET` (= `signing_key` donnée à la création du webhook Meetch ; signature `Webhook-Signature` vérifiée), `MEETCH_RATE` (4,5 % par défaut) et `MEETCH_MIN` (2 €).
Webhook à déclarer chez Meetch : `POST https://finalise-production.up.railway.app/api/assurance/webhook/meetch` (événements claim.opened / claim.refused / claim.refunded).
La prime n'est pas fournie par l'API Meetch : elle se calcule côté Finalise avec les tranches du contrat. Sans clé complète : mode mock.

## Sauvegardes et surveillance
- `scripts/backup.sh` : dump chiffré (AES-256) de la base, 30 sauvegardes conservées, restauration documentée en tête du script. À lancer régulièrement depuis un poste de confiance, jamais depuis un dépôt public (les dumps contiennent des données clients).
- `GET /health` (léger, utilisé par Railway) et `GET /health/db` (vérifie PostgreSQL) : brancher `/health/db` sur un moniteur d'uptime gratuit (UptimeRobot, Better Stack).
- Les erreurs serveur sont journalisées en une ligne JSON (méthode, chemin, message), sans corps de requête ni données personnelles.

## Mode bureau
Un guide crée un bureau (page `/equipe`), invite des comptes existants (guide ou secrétaire) ; l'invité doit accepter avec le code (aucun ajout à son insu). Admin et secrétaire gèrent les devis d'un guide via l'en-tête `X-Act-As` (uniquement `/api/devis` et la lecture de `/api/profil`). Le devis, les CGV, le compte Stripe et les factures restent ceux du guide ; `devis.created_by` garde la trace de qui a saisi.
