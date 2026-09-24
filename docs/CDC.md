# CDC — Check-up IA by Manica

> Handoff doc pour Claude Code. Source de vérité pour le code = le repo Git.
> À mettre à jour à chaque déploiement, pas seulement en fin de projet.
> Dernière mise à jour : 24/09/2026 — v1.0 (premier déploiement).

---

## 1. Contexte & but

**Ce que fait l'app** : un test gratuit en ligne, « Check-up IA by Manica » — 20 questions sur 5 axes, qui donne un score sur 100 et un niveau, puis oriente vers une prise de contact avec Manica (RDV ou mail).

**Pour qui** : particuliers curieux d'IA (« Pour moi ») et dirigeants / responsables évaluant la maturité IA de leur entreprise (« Pour mon entreprise »). Le profil adapte l'axe 5 (questions et libellé), les recommandations, le sous-titre du CTA et la mention de positionnement.

**Objectif business** : générer des leads qualifiés pour Manica (accompagnement IA). Indicateur clé : taux de clic sur les CTA de fin de test.

**Positionnement** : accompagnement dans la durée, pas formation ponctuelle (« IA utile et accompagnée »). Le mot « formation » n'apparaît que comme contraste (« pas une formation d'une journée ») et dans une question de l'axe 5 entreprise (`ent-e06`).

**Ton** : direct, concret, sans blabla, anti-hype. Vouvoiement.

**Contraintes fortes (v1)** :
- Zéro backend, zéro donnée personnelle collectée, calcul 100 % navigateur.
- Seule sortie de donnée = clic volontaire (RDV Google Agenda ou mail pré-rempli).
- Mobile-first (trafic LinkedIn / réseaux sociaux).
- Pas de framework ni de build : `index.html` statique + JSON, servi par GitHub Pages.
- **Aucune requête tierce** : police auto-hébergée, pas de CDN, pas d'analytics. Verrouillé par une CSP (`connect-src 'self'`, etc.) — argument « Sécurité Radicale » vérifiable.

---

## 2. Liens, accès & déploiement

- **App (prod)** : https://manicalabs.github.io/Check-up-IA-by-Manica/
- **Repo** : https://github.com/ManicaLabs/Check-up-IA-by-Manica (public) — GitHub Pages servi depuis `main`, racine.
- **Déploiement** = `git push origin main` (build auto ~1 min ; suivre `gh api repos/ManicaLabs/Check-up-IA-by-Manica/pages/builds/latest` jusqu'à `built`).
- **Auth** : sur le poste de Cédric, `gh` est authentifié (compte `cdelalande38`, admin du repo) et la clé SSH est enregistrée — le push se fait en SSH, **aucun token à fournir en session**. Si une session tourne ailleurs (sandbox), revenir au token classique scope `repo`, fourni en session, jamais commité ni affiché, révoqué après usage.
- **Cache GitHub Pages** : `max-age=600` (~10 min). Le service worker revalide en `no-cache`, donc un simple rechargement suffit en général ; en cas de doute, rechargement forcé.
- **Domaine perso** (`checkup.manica.fr` ou autre) : non configuré. Si mis en place, mettre à jour `url_app` dans `config.json`, les balises `og:*` / `canonical` d'`index.html`, et ajouter le fichier `CNAME`.

### Fichiers du repo

| Fichier | Rôle |
|---|---|
| `index.html` | App complète (HTML + CSS + JS inline) : accueil → quiz → résultat |
| `questions.json` | Banque de questions (47, toutes `a_valider`) |
| `config.json` | Lien RDV, email, seuils et textes des niveaux, recommandations, textes CTA, modèles mail et partage |
| `sw.js` | Service worker : hors ligne, réseau d'abord |
| `manifest.webmanifest` | Manifeste PWA |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Icônes |
| `og-image.png` | Image de partage (1200×630) |
| `fonts/manrope-latin.woff2`, `fonts/OFL.txt` | Police Manrope variable 400–800, sous-ensemble latin (25 Ko), licence OFL |
| `tools/validate.mjs` | Validation avant push (voir §10) |
| `tools/og-image.html`, `tools/icon-maskable.svg` | Sources de l'image OG et de l'icône maskable |
| `docs/CDC.md` | Ce document |
| `.nojekyll` | Désactive Jekyll sur GitHub Pages |

### Assets — régénération

```bash
# Icônes (Inkscape)
inkscape favicon.svg -w 512 -h 512 -o icon-512.png
inkscape favicon.svg -w 192 -h 192 -o icon-192.png
inkscape favicon.svg -w 32 -h 32 -o favicon-32.png
inkscape tools/icon-maskable.svg -w 512 -h 512 -o icon-maskable-512.png
inkscape tools/icon-maskable.svg -w 180 -h 180 -o apple-touch-icon.png
# Image OG (Chrome headless)
google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
  --virtual-time-budget=3000 --screenshot="$PWD/og-image.png" "file://$PWD/tools/og-image.html"
```

LinkedIn met l'aperçu en cache : après changement de `og-image.png`, forcer le rafraîchissement via le Post Inspector LinkedIn.

---

## 3. Architecture v1 (en prod)

### Écrans
1. **Accueil** : titre « Check-up IA » / « by Manica », tracé ECG (animé une fois au chargement), accroche, choix du profil (2 cartes radio de taille égale, aucune présélection), bouton « Commencer le test », mention rassurante. Si une session existe : « Reprendre le test » ou « Revoir mon dernier résultat ».
2. **Quiz** : barre de progression, axe + « Question X / 20 », énoncé, 4 choix (radios natifs stylés), « Valider ma réponse » → correction (bordure + icône + texte « Bonne réponse » / « Votre réponse »), explication, « Question suivante » (ou « Voir mon résultat »). Pas de retour arrière.
3. **Résultat** : score /100 en très grand (compteur animé), niveau + message, échelle des 4 niveaux avec repère, barres par axe (avec %), 3 priorités (axes les plus faibles), bloc CTA (fond bleu nuit, bouton ambre « Réserver un échange », bouton « Nous écrire », mention de positionnement), « Partager mon score », « Refaire le test ».
4. **Erreur** : si `config.json` / `questions.json` ne se chargent pas.

### Stockage local
- Clé `localStorage` : `checkup-ia:v1`, lecture/écriture sous `try/catch` (le test marche sans).
- Forme : `{ profil, items: [{ id, ordre: [4 entiers] }], reponses: [position choisie…], index }`. `ordre[k] = 0` → le choix affiché en position k est la bonne réponse.
- Une session dont un id n'existe plus dans `questions.json` est ignorée (évite les incohérences après édition de la banque).
- Rien ne sort de l'appareil.

### PWA
- `sw.js` : précache du shell (liste `PRECACHE`), stratégie réseau d'abord avec `cache: 'no-cache'` (revalidation ETag), repli cache si hors ligne ou réseau > 4 s. Les navigations ignorent les paramètres d'URL (`?utm_…` de LinkedIn).
- Bouton discret « Installer l'application » dans le pied de page quand le navigateur propose l'installation (`beforeinstallprompt`, Chrome/Android).
- **Incrémenter `VERSION` dans `sw.js`** quand la liste `PRECACHE` change (sinon inutile : le contenu se rafraîchit en ligne).

### Mesure d'audience
- Aucune en v1. Fonction `suivre(evenement)` vide dans `index.html`, déjà appelée aux 5 événements (`test_demarre`, `test_termine`, `clic_rdv`, `clic_mail`, `partage_linkedin`). Brancher Umami/Plausible = remplir cette fonction **et** ouvrir la CSP (`script-src`/`connect-src`) au domaine de l'outil.

### Partage
- Mobile (pointeur tactile + Web Share API) : feuille de partage native (LinkedIn y figure si l'app est installée), texte + URL.
- Desktop : copie du texte dans le presse-papiers + ouverture de `linkedin.com/sharing/share-offsite/?url=…` (endpoint officiel, qui n'accepte que l'URL) ; un message invite à coller le texte. L'aperçu affiché = `og-image.png` (statique : le score ne peut pas y figurer sans backend).

---

## 4. Moteur de quiz

### Axes (config.json → `axes`)
`fondamentaux` (Fondamentaux), `usages` (Usages concrets), `limites` (Limites & fiabilité), `donnees` (Données & sécurité), `entreprise` (IA en entreprise ; libellé « IA au travail » en profil perso).

### Banque (questions.json)
Schéma d'une question :
```json
{
  "id": "don-07",
  "axe": "donnees",
  "profil": "tous | perso | entreprise",
  "difficulte": "facile | moyen | avance",
  "question": "…",
  "bonne_reponse": "…",
  "distracteurs": ["…", "…", "…"],
  "explication": "…",
  "statut": "a_valider | valide"
}
```
- 47 questions : 8 par axe pour les axes 1–4 (`profil: tous`), axe 5 = 7 perso + 8 entreprise. Chaque pool a ≥ 2 faciles et ≥ 2 avancées.
- Apostrophes droites dans le JSON : l'app convertit à l'affichage (apostrophe courbe, espaces fines insécables avant `? ! : ; » %` et après `«`).
- Thèmes transverses demandés : gouvernance (`ent-e03`, `ent-e07`, `ent-e01`, `ent-p01`), agents et exécution locale (`fond-07`, `don-03`, `don-07`, `don-08`, `ent-e08`), open source / poids ouverts (`don-04`, `ent-e08`), shadow AI (`ent-p02`, `ent-e02`), formation vs accompagnement (`ent-e06`).
- **Noms d'outils** : Ollama et LM Studio cités dans l'explication de `don-03` ; OpenClaw et Hermes Agent (Nous Research) cités dans l'explication de `don-08` — vérifiés le 24/09/2026 (agents open source auto-hébergés, apparus fin 2025 / début 2026). Jamais dans les énoncés ni les réponses, pour que la question reste juste si un outil disparaît : seule l'explication serait à retoucher.
- Longueur des choix équilibrée pour ne pas trahir la bonne réponse (la plus longue dans ~23 % des questions, la plus courte dans ~19 %). `validate.mjs` alerte au-delà de 40 %.

### Tirage
- Pool = questions de l'axe, profil `tous` ou profil choisi, statut dans `config.quiz.statuts_publies`.
- Par axe : 1 facile + 1 avancée tirées au hasard, puis complété au hasard jusqu'à `questions_par_axe` (4).
- Les 20 questions sont ensuite mélangées puis triées par difficulté (faciles → moyennes → avancées) : le test monte en puissance, les axes restent entremêlés.
- Ordre des 4 choix mélangé à chaque question.

### Score
- 5 points par bonne réponse (`points_par_bonne_reponse`) → /100.
- Score par axe = bonnes / 4, en %.
- Niveau = dernier niveau dont `min` ≤ score.
- 3 priorités = 3 axes au plus faible %, égalités départagées par l'ordre des axes dans `config.json`.

---

## 5. Niveaux & recommandations (config.json)

| Score | Niveau | Message |
|---|---|---|
| 0–39 | Découverte | Vous démarrez : bonne nouvelle, les premiers gains sont souvent les plus rapides. |
| 40–64 | Curieux | Vous avez les bases. L'enjeu maintenant : passer de l'usage ponctuel à l'usage utile. |
| 65–84 | Pratiquant | Vous utilisez l'IA avec méthode. Prochaine étape : l'intégrer dans vos process. |
| 85–100 | Avancé | Solide. La question devient : comment en faire profiter toute l'équipe ? |

- Recommandations : un titre + un texte par axe, en version `perso` et `entreprise` (10 textes), chacun avec un « premier pas » concret.
- CTA : titre commun, sous-titre et mention de positionnement par profil.
- Mail : objet `Check-up IA — mon score : {score}/100` ; corps avec profil, score, niveau, détail par axe, et « Ce que j'aimerais améliorer : » à compléter.
- Variables disponibles : `{score}`, `{niveau}`, `{profil}`, `{detail_axes}`.

---

## 6. Design & identité visuelle

Palette du CDC appliquée telle quelle (en attente de validation ou de codes officiels) :

| Rôle | Clair | Sombre |
|---|---|---|
| Fond | `#F7F5F1` | `#0B1326` |
| Surfaces (cartes, choix) | `#FFFDF9` | `#111C35` |
| Titres / remplissages | `#101B33` | `#F7F5F1` |
| Texte | `#1E1E1E` | `#E8E5DE` |
| Texte secondaire | `#4A566D` | `#A8B3C8` |
| Accent CTA (RDV uniquement) | `#E8874A`, texte `#101B33` | idem |
| Bonne réponse (bordure / texte / fond) | `#2E8B57` / `#1D6940` / `#E3F0E7` | `#5DBE89` / `#85D6A8` / `#11301F` |
| Mauvaise réponse | `#C0533E` / `#9E3D2B` / `#F7E5DF` | `#E07F6A` / `#F29C88` / `#3A1B15` |

- Tous les couples texte/fond ≥ 4,5:1 (AA). **Le texte sur l'ambre est bleu nuit** : du blanc sur `#E8874A` ne fait que 2,6:1.
- L'ambre n'est utilisé que sur « Réserver un échange » (et le bouton de l'image OG). « Commencer le test » est en bleu nuit.
- Typographie : **Manrope** (géométrique, solide), auto-hébergée. Base 17 px.
- Logo : lockup texte « Manica » (800, couleur primaire) en attendant le fichier officiel.
- Motif de marque : tracé ECG (accueil, icône, image OG) — le « check-up ».
- Mode clair/sombre selon `prefers-color-scheme`. Animations coupées si `prefers-reduced-motion`.
- Accessibilité : radios natifs (navigation clavier aux flèches), focus visible, focus déplacé sur la question / le bouton, correction annoncée (`aria-live`) avec la bonne réponse lue aux lecteurs d'écran, jamais de couleur seule.

---

## 7. Mesure d'audience (optionnel)

Pas de Google Analytics. Si besoin : Umami ou Plausible, sans cookie, idéalement auto-hébergé — décision de Cédric. Branchement prévu (voir §3).

---

## 8. État d'avancement

- ✅ v1.0 (24/09/2026) : app complète, PWA installable et hors ligne, 47 questions `a_valider`, config, icônes, image OG, validation automatisée, déployée sur GitHub Pages.
- ✅ Tests réalisés avant push : `node tools/validate.mjs` (structure, 6 000 tirages simulés, scores, niveaux, modèles mail/partage, syntaxe JS, fichiers référencés) ; parcours complet dans Chrome headless en mobile clair, mobile sombre et desktop (reprise après rechargement, relecture du résultat, « Refaire », mailto, lien RDV, aucune requête externe, aucune erreur console, démarrage hors ligne).
- ⚠️ **Questions non relues** : un bandeau « Version bêta : les questions sont en cours de relecture » s'affiche dans le pied de page tant qu'une question publiée n'est pas `valide`. Il disparaît de lui-même quand toutes le sont.
- ⚠️ Pas encore testé sur vrai téléphone (iOS Safari, Android Chrome) : à faire par Cédric.

### Décisions prises par défaut (à confirmer par Cédric)
- Palette et typographie : proposition du CDC + Manrope.
- Wording : « accompagnement ».
- Domaine : URL GitHub Pages par défaut.
- Mesure d'audience : aucune.
- Textes des niveaux : ceux du CDC ; recommandations et CTA : rédigés par Claude.

---

## 9. Backlog (hors v1)

- Capture de lead intégrée avec consentement RGPD (backend ou service de formulaire auto-hébergé).
- Rapport PDF téléchargeable.
- Mode équipe (lien dirigeant → synthèse anonymisée).
- Questions à niveau adaptatif.
- Version anglaise.
- Élargissement de la banque (gouvernance, agents locaux, open source) après les premiers retours ; révision tous les 2–3 mois (vérifier en priorité les explications de `don-03` et `don-08`, qui citent des outils).

---

## 10. Pièges connus & conventions

- **Avant tout push** : `node tools/validate.mjs` doit afficher `✓ Validation OK` (il extrait le `<script>` inline et lance `node --check`, valide les JSON, simule les tirages avec la vraie logique d'`index.html` entre les marqueurs `// === LOGIQUE PURE` et `// === FIN LOGIQUE PURE ===`).
- **Garder la logique pure sans DOM** entre ces marqueurs, sinon `validate.mjs` ne peut plus l'évaluer.
- **Valider des questions** : passer `statut` à `valide`. Pour ne publier que les questions relues, mettre `"statuts_publies": ["valide"]` dans `config.json` — `validate.mjs` vérifie alors que chaque pool garde ≥ 4 questions dont 1 facile et 1 avancée.
- **localStorage** : toujours sous `try/catch`.
- **CSS `:has()`** : `.choice:has(input:checked)` est plus spécifique que `.choice.is-wrong` ; l'état « sélectionné » est donc limité à `.choices:not(.is-locked)`. Garder ce schéma si on retouche les états.
- **Texte sur l'ambre** : toujours bleu nuit (contraste).
- **CSP** stricte dans `index.html` : toute ressource tierce (analytics, police, image externe) sera bloquée tant que la CSP n'est pas ouverte explicitement.
- **Balises OG** : statiques et en URL absolue (les robots LinkedIn n'exécutent pas le JS). À mettre à jour si le domaine change.
- **Service worker** : incrémenter `VERSION` si la liste `PRECACHE` change ; tout fichier ajouté au précache doit exister (vérifié par `validate.mjs`).
- **Cache GitHub Pages** ~10 min : prévenir Cédric qu'un changement peut tarder.
- **Wording formation vs accompagnement** : accompagnement par défaut.
- **Noms d'outils IA** : jamais dans un énoncé ou une réponse sans vérification ; de préférence dans l'explication seulement.

---

## 11. Checklist de démarrage de session

1. Lire ce CDC, puis `index.html`, `config.json`, `questions.json`.
2. Vérifier l'accès push (`gh auth status`, `git ls-remote origin`). Sinon, demander un token classique scope `repo`.
3. Points encore ouverts côté Cédric :
   - relire et valider les 47 questions (`statut: valide`) avant diffusion large ;
   - logo Manica (SVG ou PNG haute résolution, fond transparent) ;
   - validation ou correction de la palette ;
   - confirmation du wording « accompagnement » ;
   - domaine personnalisé ou non ;
   - mesure d'audience ou non.
4. Après chaque déploiement : mettre à jour §8 de ce document.

Ce projet reste un bon candidat de POC en direct pour Le Café Tech Manica : « zéro backend, zéro donnée, tout calculé dans le navigateur » se vérifie en direct dans l'onglet Réseau des outils de développement.
