# CDC — Check-up IA by Manica

> Handoff doc pour Claude Code. Source de vérité pour le code = le repo Git.
> À mettre à jour à chaque déploiement, pas seulement en fin de projet.
> Dernière mise à jour : 24/09/2026 — v1.2 (logo, bascule clair/sombre, GoatCounter, partage par icônes).

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
- **Aucune requête tierce non maîtrisée** : police auto-hébergée, pas de CDN. Seule exception, GoatCounter (mesure d'audience sans cookie) : script figé `count.v5.js` verrouillé par empreinte SRI, et CSP qui n'autorise que `gc.zgo.at` (script) et `manica.goatcounter.com` (comptage). Argument « Sécurité Radicale » vérifiable dans l'onglet Réseau.

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
| `questions.json` | Banque de questions (47, toutes validées par Cédric le 24/09/2026) |
| `config.json` | Lien RDV, email, seuils et textes des niveaux, recommandations, textes CTA, modèles mail et partage |
| `sw.js` | Service worker : hors ligne, réseau d'abord |
| `manifest.webmanifest` | Manifeste PWA |
| `img/logo_manica_hd.png`, `img/logo_manica_hd_baseline.png` | Logos sources fournis par Cédric (2816×1504, niveaux de gris sur transparent) — ne pas modifier |
| `img/logo-manica-baseline-600.png`, `img/logo-manica-baseline-900.png`, `img/logo-manica-300.png` | Logos web générés (recadrés, palette 64 couleurs) |
| `img/logo-manica-baseline-clair-900.png` | Logo avec baseline en version claire, pour l'image de partage Instagram (canvas) |
| `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Icônes générées : symbole du logo en clair sur bleu nuit |
| `og-image.png` | Image de partage (1200×630) |
| `fonts/manrope-latin.woff2`, `fonts/OFL.txt` | Police Manrope variable 400–800, sous-ensemble latin (25 Ko), licence OFL |
| `tools/validate.mjs` | Validation avant push (voir §10) |
| `tools/build-assets.py` | Génère logos web et icônes depuis les logos sources (Pillow) |
| `tools/og-image.html` | Source de l'image OG |
| `docs/CDC.md` | Ce document |
| `.nojekyll` | Désactive Jekyll sur GitHub Pages |

### Assets — régénération

```bash
# Logos web + icônes, depuis img/logo_manica_hd*.png
python3 tools/build-assets.py
# Image OG (Chrome headless ; --allow-file-access-from-files pour charger le logo)
google-chrome --headless=new --hide-scrollbars --allow-file-access-from-files --window-size=1200,630 \
  --virtual-time-budget=3000 --screenshot="$PWD/og-image.png" "file://$PWD/tools/og-image.html"
```

LinkedIn met l'aperçu en cache : après changement de `og-image.png`, forcer le rafraîchissement via le Post Inspector LinkedIn.

---

## 3. Architecture v1 (en prod)

### En-tête et pied de page
- En-tête sur tous les écrans : logo à gauche, bouton de thème soleil/lune à droite (44×44 px).
- Logo **avec baseline** sur l'accueil (280 px de large sur mobile, 320 px au-delà de 640 px) ; logo **sans baseline** compact (34 px de haut) sur quiz, résultat et erreur. Bascule pilotée par `body[data-ecran]`, posé par `afficher()`.
- Pied de page : logo sans baseline (28 px), mention de confidentialité, mention de mesure d'audience, bouton d'installation.

### Écrans
1. **Accueil** : titre « Check-up IA » / « by Manica », tracé ECG (animé une fois au chargement), accroche, choix du profil (2 cartes radio de taille égale, aucune présélection), bouton « Commencer le test », mention rassurante. Si une session existe : « Reprendre le test » ou « Revoir mon dernier résultat ».
2. **Quiz** : barre de progression, axe + « Question X / 20 », énoncé, 4 choix (radios natifs stylés), « Valider ma réponse » → correction (bordure + icône + texte « Bonne réponse » / « Votre réponse »), explication, « Question suivante » (ou « Voir mon résultat »). Pas de retour arrière.
3. **Résultat** : score /100 en très grand (compteur animé), niveau + message, échelle des 4 niveaux avec repère, barres par axe (avec %), 3 priorités (axes les plus faibles), bloc CTA (fond bleu nuit, bouton ambre « Réserver un échange », bouton « Nous écrire », mention de positionnement), « Partager mon score », « Refaire le test ».
4. **Erreur** : si `config.json` / `questions.json` ne se chargent pas.

### Stockage local
- Clé `checkup-ia:theme` : `light` ou `dark`, uniquement après un clic sur la bascule. Absente = on suit la préférence système.
- Clé `localStorage` : `checkup-ia:v1`, lecture/écriture sous `try/catch` (le test marche sans).
- Forme : `{ profil, items: [{ id, ordre: [4 entiers] }], reponses: [position choisie…], index }`. `ordre[k] = 0` → le choix affiché en position k est la bonne réponse.
- Une session dont un id n'existe plus dans `questions.json` est ignorée (évite les incohérences après édition de la banque).
- Rien ne sort de l'appareil.

### PWA
- `sw.js` : précache du shell (liste `PRECACHE`), stratégie réseau d'abord avec `cache: 'no-cache'` (revalidation ETag), repli cache si hors ligne ou réseau > 4 s. Les navigations ignorent les paramètres d'URL (`?utm_…` de LinkedIn).
- Bouton discret « Installer l'application » dans le pied de page quand le navigateur propose l'installation (`beforeinstallprompt`, Chrome/Android).
- **Incrémenter `VERSION` dans `sw.js`** quand la liste `PRECACHE` change (sinon inutile : le contenu se rafraîchit en ligne).

### Thème clair / sombre
- Un petit script dans le `<head>` pose `data-theme="light|dark"` sur `<html>` **avant l'affichage** (pas de flash) : choix mémorisé, sinon `prefers-color-scheme`.
- Tous les jetons sombres sont sous `:root[data-theme="dark"]` (une seule définition). Plus de `@media (prefers-color-scheme)` dans le CSS.
- Bascule : `aria-pressed` (vrai = sombre), `title` explicite, `meta theme-color` mis à jour. Sans choix mémorisé, un changement de préférence système en cours de visite est suivi.
- Stockage bloqué : la bascule marche pour la visite, rien ne plante (testé).

### Mesure d'audience (GoatCounter)
- Script `https://gc.zgo.at/count.v5.js`, `async`, avec `integrity` SRI et `crossorigin="anonymous"`, juste avant `</body>`.
- Réglage `data-goatcounter-settings='{"no_onload": true}'` : la **page vue est comptée par l'app** (événement `load`, une fois la page visible, même logique que count.js), dans `compter()` sous try/catch. Raison : count.js lit `localStorage` sans protection ; avec un stockage bloqué (Safari/Firefox, cookies désactivés), son comptage automatique levait une `SecurityError` non interceptée (reproduit, puis corrigé en v1.1.1). Conséquence assumée : ces visiteurs ne sont pas comptés, sans erreur.
- Événements via `suivre(evenement)` → `goatcounter.count({ path, title, event: true })` : `test_demarre`, `test_termine`, `clic_rdv`, `clic_mail`, `partage_linkedin`, et depuis la v1.2 `partage_facebook`, `partage_instagram`, `partage_mail`, `partage_copie`. Seuls le nom et un titre lisible partent, jamais les réponses ni le score.
- `suivre()` ne fait rien si le script n'est pas chargé (hors ligne, bloqueur de pub) et avale toute exception : la mesure ne peut pas casser le test.
- Le service worker ignore les requêtes d'autres origines : rien de GoatCounter n'est mis en cache par l'app.
- GoatCounter ne compte pas `localhost` (comportement du script) : les tests locaux ne polluent pas les statistiques.

### Partage (v1.2 : une icône par réseau)
Zone « Partager mon score » sous le bloc CTA : 5 boutons ronds de 52 px, `aria-label` + `title` explicites, pictogrammes monochromes (`currentColor`, donc justes en clair et en sombre). LinkedIn en premier et en fond plein (prioritaire). Pictogrammes LinkedIn, Facebook, Instagram : paquet simple-icons (licence CC0), tracés intégrés dans le HTML, aucun appel externe.

| Icône | Ordinateur | Mobile (pointeur tactile) |
|---|---|---|
| LinkedIn | `linkedin.com/feed/?shareActive=true&text=…` : éditeur de post **pré-rempli** avec le texte + l'URL (lien non officiel, ne marche que sur ordinateur) | feuille de partage du téléphone (`navigator.share`, texte + URL → app LinkedIn) ; sans Web Share : `sharing/share-offsite/?url=` (officiel, URL seule) |
| Facebook | `facebook.com/sharer/sharer.php?u=` (officiel, URL seule : Facebook interdit le texte pré-rempli) | idem |
| Instagram | pas de lien de partage web : **image du score** 1080×1920 (format story) dessinée en canvas, **téléchargée** + toast explicatif | la même image passée à la feuille de partage (`navigator.share({ files })`, Instagram y figure s'il est installé) ; sinon téléchargement |
| E-mail | `mailto:?subject=…&body=…` (objet `partage.mail_objet`, corps = texte + URL), destinataire au choix | idem |
| Copier | presse-papiers **toujours confirmé** (voir ci-dessous) | idem |

- Copie : toast `#toast` 3 s (« Texte copié ! Collez-le dans votre post. »), région `role="status" aria-live="polite"` présente dès le chargement, texte copié complet annoncé aux lecteurs d'écran (`.sr-only`), couleurs inversées `--fill`/`--on-fill` (15,7:1 dans les deux modes) ; icône qui passe à une coche verte + `aria-label` « Texte copié » pendant 2 s ; panneau `#partage-panneau` qui reste affiché avec le texte exact copié et un lien « Ouvrir LinkedIn », défilé au-dessus du toast ; échec : toast « Copie impossible… », pas d'état « copié », texte proposé à la sélection.
- Image Instagram : préparée en arrière-plan 1,5 s après l'affichage du résultat (le partage natif doit suivre le clic de près, sinon Safari le refuse) ; logo `img/logo-manica-baseline-clair-900.png` (pas de `ctx.filter`, absent de Safari < 18) ; marges de 250 px en haut et en bas (zones couvertes par l'interface des stories) ; rien n'est envoyé.
- Textes : `config.partage.titre`, `.texte`, `.mail_objet`.
- L'aperçu des liens LinkedIn et Facebook = `og-image.png` (statique : le score ne peut pas y figurer sans backend).

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
- Logo officiel (fourni le 24/09/2026) : **niveaux de gris purs**, deux tons (noir et gris de la feuille), parties blanches transparentes. En mode sombre, `filter: invert(1)` : le noir devient `#E3E2E5`, la feuille `#B3B3B3`, la hiérarchie est conservée et les découpes laissent voir le fond (contrastes 14,3:1 et 8,8:1). Pas de plaque claire nécessaire. `alt="Manica"` partout ; sources ≥ 3× la taille affichée (netteté mobile).
- Favicon et icônes PWA : symbole seul (recadré automatiquement), en clair sur carré bleu nuit — lisible sur onglet clair comme sombre.
- Image OG : logo avec baseline inversé sur fond bleu nuit, « Check-up IA », tracé ECG, bouton ambre « Faire le test ».
- Motif : tracé ECG (accueil, image OG) — le « check-up ».
- Mode clair/sombre : préférence système par défaut, bascule manuelle mémorisée (voir §3). Animations coupées si `prefers-reduced-motion`.
- Accessibilité : radios natifs (navigation clavier aux flèches), focus visible, focus déplacé sur la question / le bouton, correction annoncée (`aria-live`) avec la bonne réponse lue aux lecteurs d'écran, jamais de couleur seule.

---

## 7. Mesure d'audience

GoatCounter (compte `manica`, tableau de bord https://manica.goatcounter.com), sans cookie — détails techniques au §3. Pas de Google Analytics.
Indicateur clé : taux de clic CTA = (`clic_rdv` + `clic_mail`) / `test_termine`. Taux de complétion = `test_termine` / `test_demarre`. Partage : somme des `partage_*` / `test_termine`, et répartition par réseau.

---

## 8. État d'avancement

- ✅ v1.0 (24/09/2026) : app complète, PWA installable et hors ligne, 47 questions `a_valider`, config, icônes, image OG, validation automatisée, déployée sur GitHub Pages.
- ✅ v1.2 (24/09/2026) : partage par icônes — LinkedIn (prioritaire, texte pré-rempli sur ordinateur), Facebook, Instagram (image du score générée dans le navigateur), e-mail, copie confirmée ; 4 nouveaux événements GoatCounter. Testé : liens par support, événements, copie + confirmation, image téléchargée et vérifiée (1080×1920), clair/sombre, mobile/ordinateur. Non testable en headless : la feuille de partage native (LinkedIn et Instagram sur mobile) — à vérifier sur téléphone.
- ✅ v1.1.2 (24/09/2026) : correctif de transparence du partage — la copie dans le presse-papiers était de fait silencieuse (LinkedIn s'ouvrait aussitôt dans un nouvel onglet, le message restait en petit dans l'onglet quitté). Désormais : toast annoncé aux lecteurs d'écran, bouton « Copié ! », texte copié affiché, lien « Ouvrir LinkedIn » à la demande, message honnête en cas d'échec. Recherche globale : c'était le seul accès au presse-papiers du projet.
- ✅ v1.1.1 (24/09/2026) : page vue GoatCounter déclenchée par l'app (voir §3) — plus d'erreur JS quand le stockage est bloqué.
- ✅ v1.1 (24/09/2026) : logo officiel (avec baseline sur l'accueil et l'image OG, sans baseline ailleurs), favicon et icônes PWA tirés du symbole, bascule clair/sombre mémorisée, GoatCounter avec les 5 événements. Les 47 questions ont été validées par Cédric (`statut: valide`) ; `statuts_publies` passe à `["valide"]` : une future question `a_valider` ne sera pas tirée tant qu'elle n'est pas relue. Le bandeau bêta ne s'affiche donc plus.
- ✅ Tests v1.1 avant push : `validate.mjs` (+ contrôle des origines externes, SRI obligatoire, CSP) ; parcours complet Chrome headless en 5 configurations (clair, sombre système, sombre forcé, clair forcé sur système sombre, desktop sombre) : logo attendu par écran, chargé, inversé en sombre seulement ; thème conservé au rechargement ; les 5 événements émis ; stockage bloqué ; hors ligne ; seules origines externes contactées : `gc.zgo.at` (et `manica.goatcounter.com` en prod, intercepté pendant les tests).
- ✅ Tests v1.0 avant push : `node tools/validate.mjs` (structure, 6 000 tirages simulés, scores, niveaux, modèles mail/partage, syntaxe JS, fichiers référencés) ; parcours complet dans Chrome headless en mobile clair, mobile sombre et desktop (reprise après rechargement, relecture du résultat, « Refaire », mailto, lien RDV, aucune requête externe, aucune erreur console, démarrage hors ligne).
- Bandeau « Version bêta » : s'affiche automatiquement si une question publiée n'est pas `valide` (impossible avec `statuts_publies: ["valide"]`, utile si on rouvre aux `a_valider`).
- ⚠️ Pas encore testé sur vrai téléphone (iOS Safari, Android Chrome) : à faire par Cédric.

### Décisions prises par défaut (à confirmer par Cédric)
- Palette et typographie : proposition du CDC + Manrope.
- Wording : « accompagnement ».
- Domaine : URL GitHub Pages par défaut.
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
- **CSP** stricte dans `index.html` : toute ressource tierce sera bloquée tant que la CSP n'est pas ouverte explicitement. `validate.mjs` refuse toute origine externe hors GoatCounter et tout script externe sans SRI.
- **GoatCounter SRI** : l'empreinte correspond à `count.v5.js` (figé). Pour changer de version : télécharger le fichier, recalculer `openssl dgst -sha384 -binary count.vX.js | openssl base64 -A`, mettre à jour `src` et `integrity`. Une empreinte fausse bloque le script en silence (plus de stats, l'app marche).
- **Tests sur la prod** : intercepter/bloquer `manica.goatcounter.com` pour ne pas fausser les statistiques.
- **Tester GoatCounter en local** : count.js ignore `localhost`. Pour reproduire la prod, servir sous un faux nom d'hôte (Chrome `--host-resolver-rules="MAP checkup.test 127.0.0.1"`, puis `http://checkup.test:8765/`).
- **Ne pas retirer `no_onload`** sans avoir revérifié le cas « stockage bloqué ».
- **Thème** : ne jamais réintroduire de `@media (prefers-color-scheme: dark)` dans le CSS — tout passe par `data-theme`, sinon la bascule manuelle ne peut plus forcer le mode clair.
- **Logo** : ne pas éditer les fichiers générés, relancer `tools/build-assets.py`. Si le logo officiel devenait coloré, remplacer `invert(1)` par une plaque claire en mode sombre.
- **Balises OG** : statiques et en URL absolue (les robots LinkedIn n'exécutent pas le JS). À mettre à jour si le domaine change.
- **Service worker** : incrémenter `VERSION` si la liste `PRECACHE` change ; tout fichier ajouté au précache doit exister (vérifié par `validate.mjs`).
- **Cache GitHub Pages** ~10 min : prévenir Cédric qu'un changement peut tarder.
- **Presse-papiers (et toute action discrète similaire)** : jamais d'écriture silencieuse. Chaque copie appelle `afficherToast()` juste après (confirmation visible + annonce `aria-live`), montre le texte copié, et gère l'échec sans prétendre avoir copié. Ne pas ouvrir d'onglet ou de fenêtre dans le même geste : il masquerait la confirmation (et les popups ouverts après un `await` sont souvent bloqués). `validate.mjs` échoue si un `clipboard.write…` ou `execCommand('copy')` n'est pas suivi d'un `afficherToast(` dans les 40 lignes.
- **Partage LinkedIn** : `feed/?shareActive=true&text=` n'est pas documenté par LinkedIn. S'il cesse de marcher (on arrive sur le fil sans éditeur), remplacer `LIENS_PARTAGE.linkedinTexte` par `LIENS_PARTAGE.linkedin` (officiel, URL seule) dans `preparerPartage()`.
- **Nouveau réseau de partage** : lien officiel si possible, pictogramme monochrome `currentColor`, `aria-label` + `title`, événement `partage_<réseau>` ajouté à `TITRES_EVENEMENTS`, et jamais de copie presse-papiers implicite (règle ci-dessous).
- **Wording formation vs accompagnement** : accompagnement par défaut.
- **Noms d'outils IA** : jamais dans un énoncé ou une réponse sans vérification ; de préférence dans l'explication seulement.

---

## 11. Checklist de démarrage de session

1. Lire ce CDC, puis `index.html`, `config.json`, `questions.json`.
2. Vérifier l'accès push (`gh auth status`, `git ls-remote origin`). Sinon, demander un token classique scope `repo`.
3. Points encore ouverts côté Cédric :
   - validation ou correction de la palette ;
   - logo vectoriel (SVG) si disponible, pour une netteté parfaite à toute taille ;
   - confirmation du wording « accompagnement » ;
   - domaine personnalisé ou non ;
4. Après chaque déploiement : mettre à jour §8 de ce document.

Ce projet reste un bon candidat de POC en direct pour Le Café Tech Manica : « zéro backend, zéro donnée, tout calculé dans le navigateur » se vérifie en direct dans l'onglet Réseau des outils de développement.
