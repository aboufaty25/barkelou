# Barkelou — cagnottes en ligne

**barkelou.com** · Plateforme de cagnottes en ligne pensée pour le Sénégal : mariage, baptême, santé, éducation, solidarité, projets… Les participations se font par **Wave, Orange Money, Free Money ou carte bancaire**.

Application **React (Vite)** livrée en **PWA** : sur mobile, elle s’installe sur l’écran d’accueil et se comporte comme une application native (barre d’onglets, feuilles modales, plein écran, mode hors ligne, mode sombre).

## Fonctionnalités

- **Accueil** : héros, statistiques, catégories, cagnottes à la une, nouvelles cagnottes, bannière d’installation de l’app
- **Explorer** : recherche (sans accents), filtres par catégorie, favoris, tri (populaires, récentes, bientôt finies, presque atteintes)
- **Page cagnotte** : progression, organisateur vérifié, histoire, liste des participants, mots d’encouragement, partage (WhatsApp, Facebook, copie du lien, partage natif)
- **Participer** : montants rapides ou libres, participation anonyme, message, choix Wave / Orange Money / Free Money / carte, validation, écran de remerciement
- **Créer / modifier une cagnotte** en 4 étapes, avec photo de couverture (compressée automatiquement), date limite facultative, option « masquer les montants », brouillon sauvegardé
- **Gestion organisateur** : modifier, clôturer / rouvrir, demander un retrait vers Wave / Orange Money / Free Money, supprimer
- **Mes cagnottes** : total collecté, participations reçues, mes dons, favoris
- **Compte** : inscription / connexion par numéro sénégalais, profil, thème clair / sombre / auto
- **PWA** : manifest, icônes (dont maskable), service worker Workbox, raccourcis « Créer » et « Explorer », fonctionnement hors ligne
- Pages **Comment ça marche + FAQ**, **CGU**, **Confidentialité**

## Démarrer

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # génère dist/ (icônes PWA incluses)
npm run preview   # teste la version de production
```

Node 20+ recommandé.

## Mise en ligne sur barkelou.com

**Vercel (recommandé)** — importez ce dépôt sur vercel.com : framework *Vite*, commande `npm run build`, dossier `dist`. `vercel.json` gère déjà les routes de l’application. Ajoutez ensuite le domaine `barkelou.com` dans *Settings → Domains* et suivez les enregistrements DNS indiqués.

**Netlify** — mêmes réglages ; `public/_redirects` gère les routes.

## Important : données et paiements

Cette version fonctionne **sans serveur** : comptes, cagnottes et participations sont enregistrés dans le navigateur de chaque visiteur (localStorage) et les paiements sont **simulés** (mode démonstration, affiché à l’écran). C’est idéal pour présenter et tester le produit, mais pour encaisser de vrais fonds il faut :

1. **Un backend** (base de données partagée + authentification par SMS/OTP) pour que les cagnottes soient visibles par tous.
2. **Un agrégateur de paiement** agréé au Sénégal (PayDunya, CinetPay, Wave Business API, Orange Money API…). Les clés privées doivent rester côté serveur.

Tout le code de paiement est isolé dans `src/services/payments.js` : définissez `VITE_API_URL` (voir `.env.example`) et exposez les routes décrites en tête de ce fichier pour passer en paiements réels. Les données sont centralisées dans `src/store/AppStore.jsx`, à remplacer par des appels à votre API.

## Structure

```
src/
  components/   AppShell (en-tête, barre d’onglets, pied de page), composants UI
  pages/        Home, Explore, Campaign, Contribute, Create, MyCampaigns, Profile, Auth, Info
  store/        état global + persistance, notifications
  services/     paiements (démo / API)
  lib/          utilitaires (FCFA, dates, téléphone), catégories, hooks (installation PWA, partage)
  data/         cagnottes d’exemple
scripts/icons.mjs  génère les icônes PWA depuis public/favicon.svg
```
