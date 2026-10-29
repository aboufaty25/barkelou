# Barkelou — cagnottes en ligne

**barkelou.com** · Plateforme de cagnottes en ligne pour le Sénégal : mariage, baptême, santé, éducation, solidarité, projets…
Paiements et retraits par **Wave, Orange Money, Free Money et carte bancaire** via **PayDunya**.

- Application **React (Vite) + PWA** : sur mobile elle s’installe et se comporte comme une application native.
- Serveur **Node.js (Express) + PostgreSQL** : comptes, cagnottes, paiements PayDunya, commissions, retraits, espace admin.

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
- **Tests** : `npm test` vérifie 17 scénarios dont les tentatives de fraude (IPN falsifiée, montant modifié, retraits simultanés, accès d’un autre utilisateur, injection SQL…).

## 3. Mise en ligne

### Pré-requis
- Un hébergeur Node.js : **Render**, **Railway**, **Fly.io** ou un **VPS** (Docker fourni).
- Une base **PostgreSQL** (Neon, Supabase, Render, Railway…).
- Un compte **PayDunya Business** avec une application d’intégration, et l’**API de déboursement (PUSH)** activée pour les retraits.

### Étapes
1. **Variables d’environnement** : copiez `.env.example`, générez les secrets avec `npm run secrets`, renseignez `DATABASE_URL` et `PUBLIC_URL=https://barkelou.com`.
2. **Déploiement** :
   - Render / Railway : commande de build `npm ci && npm run build`, commande de démarrage `npm start`.
   - Docker : `docker build -t barkelou . && docker run --env-file .env -p 3000:3000 barkelou`.
   Les tables sont créées automatiquement au démarrage.
3. **Compte administrateur** (une seule fois, depuis le shell de l’hébergeur) :
   ```bash
   npm run create-admin -- --phone 77XXXXXXX --name "Votre Nom" --password "un-mot-de-passe-très-solide"
   ```
4. **Connectez-vous** sur barkelou.com, ouvrez **Profil › Espace administrateur › Paramètres › PayDunya** et collez la *Master Key*, la *Private Key* et le *Token*. Commencez en mode **Test**.
5. **Chez PayDunya**, déclarez l’URL de notification `https://barkelou.com/api/payments/ipn`.
6. **Domaine** : pointez `barkelou.com` vers votre hébergeur (enregistrements DNS indiqués par celui-ci). Le HTTPS est obligatoire.
7. Faites un paiement et un retrait de test, puis passez PayDunya en mode **Production** dans les paramètres.

> PayDunya documente l’URL de production du déboursement (`/api/v2/disburse`). L’URL sandbox utilisée en mode Test (`/sandbox-api/v2/disburse`) est déduite de celle de l’encaissement : vérifiez-la avec le support PayDunya, ou testez les retraits directement en production avec de petits montants.

## 4. Développement

```bash
npm install
# PostgreSQL local requis (par défaut postgres://postgres@localhost:5432/barkelou)
npm run seed            # données de démonstration
npm run create-admin -- --phone 771000001 --password "admin-local-123"
npm run server          # API sur :3000 (PayDunya simulé automatiquement)
npm run dev             # application sur :5173
npm test                # tests de sécurité et de bout en bout (base barkelou_test)
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
