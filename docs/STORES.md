# Publier Finalise sur l'App Store et Google Play

Principe : même code React que le site, emballé par Capacitor. Le site web et l'API ne changent pas.
Le fichier `frontend/capacitor.config.json` est prêt ; rien n'est installé tant qu'on ne publie pas.

## Décisions à prendre AVANT (non modifiables après publication)
1. **Identifiant d'app (bundle id)** : `fr.finalise.app` est un placeholder. Il doit correspondre à ton nom de domaine définitif.
2. **Nom affiché** : « Finalise » (vérifier qu'il est libre sur les deux stores).
3. **Compte développeur** : Apple Developer 99 $/an (compte individuel ou organisation, délai de validation 1 à 3 jours) ; Google Play 25 $ une fois (vérification d'identité).

## Matériel nécessaire
- iOS : un Mac avec Xcode (obligatoire pour construire et soumettre).
- Android : Android Studio (Windows suffit).
- Icône 1024×1024 sans transparence, captures d'écran (iPhone 6,7", Android), politique de confidentialité en ligne (`/confidentialite`), page de support, texte de description.

## Étapes techniques
```
cd frontend
npm i @capacitor/core @capacitor/ios @capacitor/android @capacitor/push-notifications
npm i -D @capacitor/cli
npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios      # puis Archive → TestFlight
npx cap open android  # puis Build → Android App Bundle
```

## Points d'attention
- **Notifications** : dans l'app native, le Web Push du navigateur ne s'applique pas. Il faut le plugin push (APNs sur iOS, FCM sur Android) et un second canal d'envoi dans `backend/lib/push.js` (`sendToPro`). À faire en phase 2.
- **API** : l'app appelle `https://finalise-production.up.railway.app` (ou le domaine définitif). Ajouter les origines `capacitor://localhost` et `https://localhost` à CORS dans le backend.
- **Règle Apple 3.1.1** : l'achat dans l'app de services numériques passe par Apple ; Finalise encaisse des prestations physiques (sorties en montagne) pour le compte de tiers, ce qui est autorisé via un paiement externe, mais à décrire clairement dans les notes de revue.
- **Règle Apple 4.2** : l'app doit être plus qu'un site emballé. Notifications push natives, partage et ouverture des liens de devis la justifient.
- **Compte de démonstration** : Apple exige des identifiants de test pour la revue.
- **Suppression de compte** : Apple et Google exigent une suppression de compte dans l'app (à ajouter avant soumission).
