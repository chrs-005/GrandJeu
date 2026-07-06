# L'Olympe — Le Grand Jeu des Dieux

PWA de grand jeu scout sur le thème de la mythologie grecque. 5 équipes se connectent sur
leurs téléphones (iPhone, app installée sur l'écran d'accueil), l'admin pilote tout depuis la
« Console des Dieux » : il lance des défis, les téléphones reçoivent une notification push et
le défi apparaît instantanément dans l'app.

## Les défis

| Défi | Dieu | Mécanique |
|---|---|---|
| 🏃 **La Course d'Hermès** | Hermès | Le plus de pas dans le temps imparti (capteur de mouvement). Le classement est **voilé dans la dernière ligne droite**, points au classement automatiques. |
| 🔮 **L'Oracle de Delphes** | La Pythie | Quiz synchronisé style Kahoot. Questions chronométrées, points selon la rapidité, révélation entre chaque question. 2 packs de questions mythologie inclus. |
| 🐍 **Le Regard de Méduse** | Méduse | Une prime sur la tête d'un scout : chaque équipe doit le photographier pour le « pétrifier ». L'admin valide les photos et attribue les points. |
| 💪 **Les Travaux d'Héraclès** | Héraclès | Missions photo (« photo de l'équipe en pyramide humaine »…). Presets inclus + missions personnalisées. Validation admin. |
| 🎨 **Le Défi des Muses** | Les Muses | Style Gartic Phone : chaque équipe dessine un sujet, puis devine le dessin d'une autre équipe. L'admin voit les paires sujet/dessin/réponse et note. |
| 🦁 **L'Énigme du Sphinx** | Le Sphinx | Énigme texte à réponse libre, vérifiée automatiquement (accents/majuscules ignorés). Bonus premier arrivé. **Parfait pour les énigmes de lieux du jeu de piste.** |

Plus : classement permanent « Mont Olympe », carte GPS des équipes en temps réel,
notifications push libres, ajustement manuel des scores, historique des points.

## Les équipes

Chaque compte équipe est le champion d'un dieu (couleur + emblème dans l'app) :
`faucon` → Zeus, `leopard` → Artémis, `panda` → Athéna, `requin` → Poséidon, `bison` → Arès.
(Mapping dans `src/config/gameConfig.js`.)

## Tech

- **Frontend :** React + Vite + `vite-plugin-pwa` (installable iOS ≥ 16.4)
- **Auth & DB :** Firebase Auth (comptes équipe `xxx@grandjeu.local`) + Firestore
- **Backend :** 2 fonctions serverless Vercel — `api/game.js` (joueurs) et `api/admin.js` (admin) —
  avec cache mémoire pour rester sous le quota gratuit Firestore malgré le polling
- **Push :** Web Push (VAPID) via `web-push`

### Modèle Firestore

```
users/{uid}                      profil équipe + location + pushSubscriptions/
gameState/current                { challengeId, type }   ← défi affiché chez les équipes
gameState/scores                 { teams: { uid: { username, score } } }
challenges/{id}                  { type, status, startAtMs, endAtMs, config, board }
challenges/{id}/media/{uid}      photos & dessins (data URLs JPEG compressés < 900 Ko)
scoreLog/*                       historique des attributions de points
```

Les clients ne lisent Firestore qu'à travers l'API (Admin SDK) — seuls `users/{uid}` et ses
`pushSubscriptions` sont accessibles côté client (voir `firestore.rules`).

## Setup (identique au POC)

1. Projet Firebase : Auth Email/Password activé + Firestore + règles `firestore.rules`.
2. `npm run generate-vapid` → copier les 3 clés.
3. `.env` d'après `.env.example` (Firebase web config, VAPID, service account admin).
4. `npm run seed-users` → crée les comptes de `data/users.json` (admin + 5 équipes).
5. Déploiement Vercel : framework Vite, build `npm run build`, output `dist`,
   toutes les variables d'environnement de `.env.example`.

## Jour J — checklist admin

1. Chaque équipe : ouvrir l'URL dans **Safari** → Partager → **« Sur l'écran d'accueil »** →
   ouvrir depuis l'icône → se connecter → accomplir les **Rituels** (notifications + GPS).
2. Vérifier sur `/admin` que les 5 équipes apparaissent sur la carte.
3. Tester une notification (« Test sur moi » puis « Envoyer à tous »).
4. Lancer les défis au fil du jeu depuis « Lancer un défi ». Chaque lancement envoie
   automatiquement un push thématique et affiche le défi chez les équipes.
5. Pour les défis photo/dessin : juger dans « Défi en cours » avec les boutons +100/+70/+50/+30.
6. « Retirer de l'écran des équipes » ramène tout le monde au Mont Olympe.

**Notes iOS :** les notifications push exigent l'app installée sur l'écran d'accueil (iOS 16.4+).
Le compteur de pas utilise l'accéléromètre : le téléphone doit rester en main, app ouverte.
