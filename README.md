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
