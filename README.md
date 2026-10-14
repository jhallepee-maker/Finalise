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
Variables Railway : `MEETCH_ENABLED=1`, `MEETCH_API_KEY`, `MEETCH_BASE_URL`, `MEETCH_PRODUCT_ID`, `MEETCH_ORGANIZATION_ID` (optionnel), `MEETCH_WEBHOOK_SECRET` (en-tête `x-finalise-secret` sur `POST /api/assurance/webhook/meetch`), `MEETCH_RATE` (4,5 % par défaut, mode mock) et `MEETCH_MIN`.
Sans clé complète : mode mock (aucun appel réseau). Auth et chemin du calcul de prime à confirmer avec Meetch.
