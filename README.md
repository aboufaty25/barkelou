# Barkelou — cagnottes en ligne

**barkelou.com** · Plateforme de cagnottes en ligne pour le Sénégal : mariage, baptême, santé, éducation, solidarité, projets…
Paiements et retraits par **Wave, Orange Money, Free Money et carte bancaire** via **PayDunya**.

- Application **React (Vite) + PWA** : sur mobile elle s’installe et se comporte comme une application native.
- Serveur **Node.js (Express) + MySQL / MariaDB** (base Hostinger) : comptes, cagnottes, paiements PayDunya, commissions, retraits, espace admin.

---

## 1. Ce que fait la plateforme

**Organisateurs** : créer une cagnotte (photo, objectif, date limite, montants masquables), la partager, suivre les participations, **retirer leur argent à tout moment** vers Wave / Orange Money / Free Money.

**Donateurs** : participer sans compte, anonymement s’ils le souhaitent, avec un petit mot. Le paiement se fait sur la page sécurisée PayDunya.

**Administrateur** (`/admin`) :
| Section | Contenu |
|---|---|
| Tableau de bord | Total collecté, commissions gagnées, fonds à reverser, versements, alertes, graphique 30 jours |
| Paramètres | Commission (% + fixe, payée par l’organisateur ou le donateur), frais de retrait, minimums / maximums, plafond de retrait par 24 h, retraits automatiques ou validés à la main, moyens de paiement et de retrait activés, **clés PayDunya** (test / production), inscriptions, validation des cagnottes, mode maintenance, contacts |
| Retraits | Valider / refuser (mode manuel), suivre les envois |
| Paiements | Tous les paiements avec commission et net |
| Cagnottes | Valider, suspendre, réactiver, mettre à la une |
| Utilisateurs | Suspendre, nommer administrateur |
| Journal | Journal de sécurité de toutes les opérations sensibles |

## 2. Sécurité

- **Argent** : le navigateur n’est jamais cru. Chaque paiement est confirmé directement auprès de PayDunya (API *confirm*), le montant payé doit correspondre exactement, les notifications PayDunya sont vérifiées (signature SHA-512) et traitées une seule fois.
- **Retraits** : mot de passe redemandé à chaque retrait, envoi uniquement au numéro du compte (réglable), verrou en base empêchant deux retraits simultanés de dépasser le solde, plafond par 24 h, solde restitué automatiquement si l’opérateur échoue, vérification en tâche de fond des retraits en cours.
- **Comptes** : mots de passe hachés (bcrypt), session en cookie `httpOnly` / `Secure` / `SameSite`, verrouillage après 5 échecs, limitation de débit sur la connexion, les paiements et les retraits, déconnexion de tous les appareils, suspension immédiate.
- **Admin** : chaque changement de paramètres, validation de retrait ou nomination d’admin exige le mot de passe administrateur. Les clés PayDunya sont **chiffrées en base (AES-256-GCM)** et ne sont jamais réaffichées.
- **Web** : protection CSRF (en-tête dédié + contrôle d’origine), en-têtes de sécurité stricts (CSP, HSTS, anti-iframe), validation de toutes les entrées, requêtes SQL paramétrées, vérification du contenu réel des images envoyées, journal d’audit.
- **Tests** : `npm test` vérifie 18 scénarios dont les tentatives de fraude (IPN falsifiée, montant modifié, retraits simultanés, accès d’un autre utilisateur, injection SQL…).

## 3. Mise en ligne sur Hostinger

Offre nécessaire : **Business Web Hosting** ou **Cloud** (applications Node.js), ou un **VPS**.
PayDunya : un compte Business avec une application d’intégration et l’**API de déboursement (PUSH)** activée pour les retraits.

### a. Créer la base MySQL
hPanel › **Bases de données › Gestion des bases MySQL** › créez une base et un utilisateur (ex. `u123456789_barkelou`). Notez le nom, l’utilisateur et le mot de passe. Les tables sont créées automatiquement au premier démarrage.

### b. Créer l’application Node.js
hPanel › **Sites web › Ajouter un site › Application web Node.js** › **Importer depuis GitHub** › dépôt `barkelou`, branche `main`.
| Réglage | Valeur |
|---|---|
| Version de Node | 22.x |
| Commande de build | `npm run build` |
| Dossier de sortie | `dist` |
| Fichier d’entrée | `server.js` |

### c. Variables d’environnement
Dans les réglages de l’application, ajoutez (modèle complet dans `.env.example`) :
```
PUBLIC_URL=https://barkelou.com
DB_HOST=127.0.0.1          ← pas « localhost »
DB_PORT=3306
DB_NAME=u123456789_barkelou
DB_USER=u123456789_barkelou
DB_PASSWORD=…
JWT_SECRET=…               ← généré avec  npm run secrets
ENCRYPTION_KEY=…           ← généré avec  npm run secrets
TRUST_PROXY=1
```
`npm run secrets` se lance sur votre ordinateur (ou en SSH). **Gardez une copie d’`ENCRYPTION_KEY`** : sans elle, les clés PayDunya enregistrées devront être ressaisies.
Puis **Déployer** (ou **Redémarrer** après un changement de variable).

### d. Compte administrateur
- **Sans SSH** : inscrivez-vous sur barkelou.com avec votre numéro, ajoutez la variable `ADMIN_PHONE=77XXXXXXX`, redémarrez l’application. Votre compte devient administrateur. Retirez ensuite la variable.
- **Avec SSH** : `npm run create-admin -- --phone 77XXXXXXX --name "Votre Nom" --password "mot-de-passe-très-solide"`

### e. Brancher PayDunya
1. Sur barkelou.com : **Profil › Espace administrateur › Paramètres › PayDunya** : collez *Master Key*, *Private Key*, *Token*. Commencez en mode **Test**.
2. Chez PayDunya, déclarez l’URL de notification `https://barkelou.com/api/payments/ipn`.
3. Faites un paiement et un retrait de test, puis passez en mode **Production**.

> PayDunya documente l’URL de production du déboursement (`/api/v2/disburse`). L’URL sandbox utilisée en mode Test (`/sandbox-api/v2/disburse`) est déduite de celle de l’encaissement : vérifiez-la avec le support PayDunya, ou testez les retraits directement en production avec de petits montants.

### Autres hébergeurs
VPS (Hostinger ou autre) : `docker build -t barkelou . && docker run --env-file .env -p 3000:3000 barkelou`, ou `npm ci && npm run build && npm start` derrière Nginx. Toute base MySQL 8 / MariaDB 10.5+ convient.

## 4. Développement

```bash
npm install
# MySQL / MariaDB local requis : renseignez DB_USER, DB_PASSWORD, DB_NAME dans .env
npm run seed            # données de démonstration
npm run create-admin -- --phone 771000001 --password "admin-local-123"
npm run server          # API sur :3000 (PayDunya simulé automatiquement)
npm run dev             # application sur :5173
npm test                # tests de sécurité et de bout en bout (base barkelou_test, vidée à chaque lancement)
```

Hors production, PayDunya est **simulé** : le bouton « Payer » ouvre un simulateur qui permet de valider ou d’annuler le paiement, et les retraits réussissent (un numéro se terminant par `000` simule un échec). Ce simulateur est impossible à activer en production.

## 5. Structure

```
server/
  index.js, app.js        démarrage, sécurité HTTP, tâches de fond
  routes/                 auth, campaigns, payments (PayDunya + IPN), withdrawals, admin
  lib/                    paydunya, settings (paramètres admin), money (commissions, soldes), auth, crypto, limites
  migrations/             schéma SQL
  scripts/                create-admin, seed, secrets
  test/                   tests de l’API
src/                      application React (pages, composants, PWA)
```
