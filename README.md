# Sephora & Jonathan — site privé de gestion du mariage

Application React + TypeScript + Supabase : invités, familles, plan de table, authentification et rôles.

## Fonctionnalités livrées

- Page de bienvenue et connexion par e-mail/mot de passe.
- Tableau de bord, liste invités, filtres Jonathan / Église / Sephora / À classer.
- Recherche, ajout, modification et suppression des invités.
- Familles proposées à partir des noms ; correction manuelle depuis la liste.
- Plan de table : création des tables, capacité, attribution table/siège.
- Import d'un plan en image ou PDF (administrateurs uniquement).
- Rôles administrateur / collaborateur appliqués dans Supabase RLS.
- Import CSV et export JSON de sauvegarde.
- Synchronisation en base Supabase (rechargement manuel disponible).

## Prérequis

- Node.js 20+
- Un compte Supabase
- Un compte GitHub pour versionner le code
- Un compte Cloudflare pour publier le site

## 1. Créer le projet Supabase

1. Créer un projet sur https://supabase.com.
2. Ouvrir SQL Editor et exécuter le fichier `supabase/migrations/0001_initial_schema.sql`.
3. Dans Authentication > URL Configuration, ajouter l'URL locale `http://localhost:5173` puis l'URL Cloudflare après publication.
4. Dans Project Settings > API, copier Project URL et la clé `anon` / publishable (jamais la service_role dans le navigateur).
5. Copier `.env.example` vers `.env` et renseigner les valeurs.

## 2. Créer les deux comptes administrateurs

1. Dans Supabase Authentication > Users, créer/inviter d'abord ton compte et celui de Jonathan.
2. Les profils sont créés automatiquement en rôle `collaborator`.
3. Dans SQL Editor, remplacer les deux e-mails et exécuter :

```sql
update public.profiles
set role = 'admin'
where email in ('TON_EMAIL', 'EMAIL_JONATHAN');
```

4. Vérifier que les deux profils ont le rôle `admin`.

## 3. Déployer la fonction d'invitation

Installer la CLI Supabase, se connecter, lier le projet puis exécuter :

```bash
supabase functions deploy invite-user
```

La fonction utilise les secrets gérés par Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Ne jamais exposer la clé service_role dans le code client.
Les invitations sont envoyées par e-mail via Supabase Auth. Configurer un fournisseur SMTP personnalisé dans Supabase pour une bonne délivrabilité en production.

## 4. Lancer en local

```bash
npm install
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

## 5. Importer la liste d'invités

Depuis la page Invités, utiliser « Importer CSV » et choisir `data/liste-invites-19-novembre.csv`.
L'import regroupe les doublons exacts sur prénom + nom et met à jour les fiches ayant la même clé.
Contrôler les catégories après import : le CSV source peut contenir des libellés différents.
Les numéros de table et de siège ne sont pas préremplis.

## 6. Déployer sur Cloudflare Pages (HTTPS)

1. Pousser le dossier du projet dans un dépôt GitHub.
2. Dans Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
3. Sélectionner le dépôt.
4. Build command : `npm run build`
5. Build output directory : `dist`
6. Ajouter les variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
7. Déployer : Cloudflare attribue une adresse `https://NOM.pages.dev`.
8. Ajouter cette URL dans Supabase Authentication > URL Configuration (Site URL et Redirect URLs).

Le HTTPS est fourni automatiquement par Cloudflare sur le sous-domaine `pages.dev`.

## Sécurité et limites à connaître avant production

- Le navigateur ne contient que la clé publique anon/publishable. La clé `service_role` reste exclusivement dans les secrets Edge Function.
- Les politiques RLS autorisent tout utilisateur authentifié à créer/modifier/supprimer les invités, mais réservent tables, plan et fichiers aux administrateurs.
- Les profils sont créés avec rôle collaborateur ; les deux administrateurs doivent être promus manuellement au départ.
- Les invitations supplémentaires passent par la fonction Edge `invite-user`.
- La fonction d'invitation limite l'objectif à 22 profils mais ce contrôle doit être surveillé si plusieurs invitations simultanées sont envoyées.
- Pour la production, configurer SMTP, politique de mot de passe, MFA pour les administrateurs, sauvegardes externes et règles de conservation.
- Le plan de table est stocké dans un bucket privé. La version actuelle génère un lien signé d'une durée limitée pour le fichier importé ; si le lien expire, recharger le fichier depuis l'espace administrateur (amélioration recommandée : générer le lien signé à chaque affichage).
- La vue de plan de table affiche les tables et listes de places ; l'éditeur graphique de placement sur le fond PDF/image est une évolution prévue, pas une fonctionnalité incluse dans cette première version.

## Arborescence

- `src/` : interface React.
- `supabase/migrations/` : schéma SQL et sécurité RLS.
- `supabase/functions/invite-user/` : invitations administrateur.
- `data/` : fichier CSV source à importer.
