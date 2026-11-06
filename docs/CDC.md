# CDC — Check-up IA by Manica

> Handoff doc pour Claude Code. Source de vérité pour le code = le repo Git.
> À mettre à jour à chaque déploiement, pas seulement en fin de projet.
> Dernière mise à jour : 06/11/2026 — v2.0 (tunnel de conversion : profils métier, quiz en 1 clic par question, score libre puis diagnostic contre nom + e-mail, leads dans une Google Sheet, agenda intégré, 85 questions).

---

## 1. Contexte & but

**Ce que fait l'app** : un test gratuit en ligne, « Check-up IA by Manica » — 10 questions sur 5 axes adaptées au métier du visiteur (tirées dans une banque de 85 depuis la v2.0), qui donne un score sur 100 et un niveau, puis un diagnostic détaillé contre nom + e-mail, et oriente vers un échange de 30 min réservé dans la page. Depuis la v2.0, c'est un élément du tunnel de conversion de Manica (refonte issue du coaching Funnel Building du 30/09/2026, voir `docs/conseils_checkup_ia.md`).

**Pour qui** : « Pour moi » (particuliers) ou, pour l'entreprise, **Dirigeant·e, DSI / IT, Marketing / Com, Autre métier** (précision facultative en un mot). Chaque rôle (`config.roles`) est rattaché à un profil `perso` ou `entreprise`, qui adapte l'axe 5 (questions et libellé), les recommandations et la mention de positionnement ; le rôle oriente le tirage (questions écrites pour ce métier) et le sous-titre du bloc RDV.

**Objectif business** : générer des leads qualifiés pour Manica (accompagnement IA). Indicateurs clés : taux de leads (`lead_envoye` / `test_termine`) et taux d'ouverture de l'agenda (`rdv_ouvert*` / `lead_envoye`).

**Positionnement** : accompagnement dans la durée, pas formation ponctuelle (« IA utile et accompagnée »). Le mot « formation » n'apparaît que comme contraste (« pas une formation d'une journée ») et dans une question de l'axe 5 entreprise (`ent-e06`).

**Ton** : direct, concret, sans blabla, anti-hype. Vouvoiement.

**Contraintes fortes** :
- Pas de serveur à nous : score calculé dans le navigateur. **Depuis la v2.0, des données personnelles sont collectées** quand le visiteur demande son diagnostic (nom, e-mail, profil, résultats) : envoi à une application web Google Apps Script → Google Sheet (`docs/LEADS.md`). Aucune autre sortie de donnée. Aucun texte ne doit plus promettre « sans inscription » ou « zéro donnée » (`validate.mjs` le vérifie).
- Mobile-first (trafic LinkedIn / réseaux sociaux).
- Pas de framework ni de build : `index.html` statique + JSON, servi par GitHub Pages.
- **Aucune requête tierce non maîtrisée** : police auto-hébergée, pas de CDN. Exceptions explicites dans la CSP : GoatCounter (`gc.zgo.at` script figé SRI, `manica.goatcounter.com` comptage), Apps Script (`script.google.com`, `script.googleusercontent.com`, en `connect-src`, seulement à l'envoi du formulaire) et l'agenda Google (`calendar.google.com` en `frame-src`, chargé seulement à l'ouverture de la fenêtre de réservation).

---

## 2. Liens, accès & déploiement

- **App (prod)** : https://checkup-ia.manica.fr/ (domaine personnalisé depuis le 06/11/2026 : fichier `CNAME` à la racine, DNS `checkup-ia CNAME manicalabs.github.io.` chez l'hébergeur de manica.fr ; l'ancienne adresse https://manicalabs.github.io/Check-up-IA-by-Manica/ redirige automatiquement)
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
| `tools/e2e.mjs`, `tools/package.json` | Test de bout en bout dans Chrome (serveur local intégré qui imite GitHub Pages, ou prod via `BASE=`) ; `puppeteer-core` en dépendance de développement |
| `mentions-legales.html` | Mentions légales et confidentialité (éditeur, hébergeur, données, GoatCounter, refus de la mesure, droits) |
| `404.html` | Page introuvable aux couleurs Manica, servie par GitHub Pages pour toute adresse inconnue |
| `pages.css` | Styles des pages secondaires (mêmes jetons clair/sombre que le test) |
| `img/cedric-delalande.jpg` | Photo du bloc RDV (256×256, 8 Ko) |
| `.gitignore` | Exclut `tools/node_modules/`, `tools/package-lock.json`, `tools/.e2e-captures/` |
| `tools/build-assets.py` | Génère logos web et icônes depuis les logos sources (Pillow) |
| `tools/apps-script/Code.gs` | Réception des leads : application web Apps Script liée à une Google Sheet (installation : `docs/LEADS.md`) |
| `docs/LEADS.md` | Installation et fonctionnement de la réception des contacts |
| `docs/conseils_checkup_ia.md` | Conseils du coaching Funnel Building (30/09/2026) à l'origine de la v2.0 — **local seulement, non versionné** (notes privées, dépôt public) |
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
- Depuis la v1.5, plus de « by Manica » sous le titre de l'accueil : le logo avec baseline juste au-dessus le dit déjà.
- Pied de page : lien « Mentions légales et confidentialité ».
- En-tête sur tous les écrans : logo à gauche, bouton de thème soleil/lune à droite (44×44 px).
- Logo **avec baseline** sur l'accueil (280 px de large sur mobile, 320 px au-delà de 640 px) ; logo **sans baseline** compact (34 px de haut) sur quiz, résultat et erreur. Bascule pilotée par `body[data-ecran]`, posé par `afficher()`.
- Pied de page : logo sans baseline (28 px), mention de confidentialité, mention de mesure d'audience, bouton d'installation.

### Écrans (v2.0)
1. **Accueil** : titre, tracé ECG, promesse (« 10 questions adaptées à votre métier, 3 minutes. Votre score tout de suite, votre diagnostic détaillé ensuite. »), puis **« Vous passez le test… »** : carte pleine largeur « Pour moi », puis « Pour mon entreprise, je suis… » et 4 cartes (Dirigeant·e, DSI / IT, Marketing / Com, Autre métier). **Un clic sur une carte lance le test** ; « Autre métier » ouvre un champ facultatif « Votre métier » + « Commencer le test ». Les boutons portent `data-role` = id de `config.roles` (vérifié par `validate.mjs`). Dessous : « Ce que vous obtenez » (3 points), reprise éventuelle, puis le bloc commun « Qui est derrière le test ? » + FAQ.
2. **Quiz** : barre de progression, « Précédente » (dès la question 2) + « Question X / 10 », axe, énoncé, 4 choix en boutons (lettres A–D). **Un clic = réponse enregistrée + question suivante** (réponse marquée 200 ms, glissement 160 ms, sans animation si `prefers-reduced-motion`). Aucune correction pendant le test : tout est dans le corrigé final. « Précédente » réaffiche la question avec la réponse marquée ; un clic la remplace. Aide « Touchez votre réponse… » sur la 1re question seulement.
3. **Résultat, partie libre** : score /100 (taille réduite en v2.0), niveau, message, échelle. Puis le **formulaire** (`#r-gate`) : « Votre diagnostic détaillé est prêt », accroche « X bonnes réponses sur 10. Découvrez lesquelles… », 3 bénéfices, champs **Prénom et nom** + **E-mail** (« E-mail professionnel » pour les profils entreprise), case **« Prévenez-moi des prochains lives et contenus IA »** (décochée), bouton « Voir mon diagnostic », mention de confidentialité. Champ piège invisible `site` (robots). Erreurs affichées sous les champs.
4. **Résultat, diagnostic débloqué** (`#r-diagnostic`, affiché **immédiatement** au clic, l'envoi se fait en arrière-plan) : « Votre diagnostic, Prénom » ; **Détail par axe avec code couleur** (vert « Acquis » ≥ 60 %, bleu nuit « En cours », terre cuite « À renforcer » < 30 % ; toujours avec le libellé, jamais la couleur seule) ; 3 priorités ; **bloc RDV** (photo, nom, titre, sous-titre selon le rôle, **un seul bouton ambre « Réserver mon échange offert »**, micro-réassurances « 30 min · sans engagement · offert », « Cédric aura vos résultats sous les yeux : rien à recopier » une fois le lead confirmé, lien discret « Plutôt par écrit ? Nous écrire » (mailto pré-rempli), positionnement) ; **corrigé question par question** (accordéons : ✓/✗, votre réponse, bonne réponse, explication) ; partage (icônes réduites à 46 px) ; « Refaire le test ».
5. **Fenêtre de réservation** (`#dialogue-rdv`) : agenda Google intégré en `<iframe>` (`config.contact.lien_rdv_integre`, version `?gv=true`), chargé à la première ouverture seulement ; lien de secours « Ouvrez-le dans un nouvel onglet » (`lien_rdv`).
6. **Bulle RDV** (`#bulle-rdv`) : photo + « Besoin de conseils sur l'IA ? / Réserver 30 min », fixe en bas à droite, visible sur le diagnostic tant que le bloc RDV n'est pas à l'écran (IntersectionObserver), ouvre la même fenêtre.
7. **Qui est derrière + FAQ** (`#apropos`, hors des écrans) : visible sur l'accueil et le résultat. Textes dans `config.a_propos` (titre, texte, preuve, lien LinkedIn facultatif) et `config.faq` (accordéons).
8. **Erreur** : si `config.json` / `questions.json` ne se chargent pas.

Retirés en v2.0 : bouton « Valider ma réponse » et correction après chaque question, adresse e-mail en clair + « Copier l'adresse », indication « Indiquez votre score en réservant », panneau du texte copié (le toast suffit), second bouton « Nous écrire ».

### Stockage local
- `checkup-ia:theme` : `light` ou `dark`, uniquement après un clic sur la bascule.
- `checkup-ia:v2` (session) : `{ cible: { role, profil }, precision, items: [{ id, ordre }], reponses, index, debloque, contact: { nom }, leadEnvoye }`. `ordre[k] = 0` → le choix affiché en position k est la bonne réponse. La clé v1 est ignorée.
- `checkup-ia:contact` : `{ nom, email }`, pour pré-remplir le formulaire au test suivant.
- `checkup-ia:lead-en-attente` : contact dont l'envoi a échoué, renvoyé au chargement suivant.
- Lecture/écriture toujours sous `try/catch` (le test et le diagnostic marchent sans stockage).

### Leads (v2.0)
- `donneesLead()` (logique pure, testée) construit l'envoi : id unique, date, nom, e-mail, optin, rôle + libellé + précision, score, niveau, bonnes réponses, axes, 3 priorités (titre + texte), corrigé complet (axe, énoncé, réponse donnée, bonne réponse, explication — pour l'e-mail récapitulatif et le suivi), `utm_*` et site d'origine, page.
- `envoyerLead()` : POST `text/plain` vers `config.leads.url` (requête simple, sans pré-vérification CORS), délai 15 s ; si la réponse n'est pas lisible, nouvel essai `no-cors`. Le script Apps Script ignore un id déjà reçu.
- Détail, installation et RGPD : `docs/LEADS.md`.

### PWA
- `sw.js` : précache du shell (liste `PRECACHE`), stratégie réseau d'abord avec `cache: 'no-cache'` (revalidation ETag), repli cache si hors ligne ou réseau > 4 s. Les navigations ignorent les paramètres d'URL (`?utm_…` de LinkedIn).
- Bouton discret « Installer l'application » dans le pied de page quand le navigateur propose l'installation (`beforeinstallprompt`, Chrome/Android).
- **Incrémenter `VERSION` dans `sw.js`** quand la liste `PRECACHE` change (sinon inutile : le contenu se rafraîchit en ligne).

### Couche mobile (v1.5, skill `mobile-native`)
- `-webkit-tap-highlight-color: transparent` une seule fois sur `html` ; chaque contrôle a son `:active`.
- `touch-action: manipulation` sur `button, a, label` (pas d'attente du double-tap) ; `user-select: none` + `-webkit-touch-callout: none` sur les contrôles uniquement (le contenu reste sélectionnable).
- Tous les `:hover` dans `@media (hover: hover) and (pointer: fine)` (sinon survol collé après un tap) — vérifié par `validate.mjs`.
- Champs de saisie ≥ 16 px (sinon zoom iOS) — vérifié par `validate.mjs`.
- Fenêtres de partage : `overscroll-behavior: contain` ; viewport `interactive-widget=resizes-content` (clavier Android).
- `text-wrap: balance` sur les titres, `pretty` sur les paragraphes.
- Manifeste : `theme_color` #F7F5F1 (haut de page clair ; la balise `theme-color` suit ensuite le thème).
- À confirmer sur un vrai téléphone : survol, flash au tap, zoom, barre d'état de l'app installée sur iPhone.

### Thème clair / sombre
- Un petit script dans le `<head>` pose `data-theme="light|dark"` sur `<html>` **avant l'affichage** (pas de flash) : choix mémorisé, sinon `prefers-color-scheme`.
- Tous les jetons sombres sont sous `:root[data-theme="dark"]` (une seule définition). Plus de `@media (prefers-color-scheme)` dans le CSS.
- Bascule : `aria-pressed` (vrai = sombre), `title` explicite, `meta theme-color` mis à jour. Sans choix mémorisé, un changement de préférence système en cours de visite est suivi.
- Stockage bloqué : la bascule marche pour la visite, rien ne plante (testé).

### Mesure d'audience (GoatCounter)
- Script `https://gc.zgo.at/count.v5.js`, `async`, avec `integrity` SRI et `crossorigin="anonymous"`, juste avant `</body>`.
- Réglage `data-goatcounter-settings='{"no_onload": true}'` : la **page vue est comptée par l'app** (événement `load`, une fois la page visible, même logique que count.js), dans `compter()` sous try/catch. Raison : count.js lit `localStorage` sans protection ; avec un stockage bloqué (Safari/Firefox, cookies désactivés), son comptage automatique levait une `SecurityError` non interceptée (reproduit, puis corrigé en v1.1.1). Conséquence assumée : ces visiteurs ne sont pas comptés, sans erreur.
- Événements via `suivre(evenement)` → `goatcounter.count({ path, title, event: true })`. v2.0 : `test_demarre`, `profil_<role>`, `question_02`, `question_03`, `question_06`, `question_09` (progression), `test_termine`, `formulaire_vu`, `lead_envoye`, `lead_echec`, `rdv_ouvert` (bloc RDV), `rdv_ouvert_bulle`, `clic_rdv` (agenda en nouvel onglet), `clic_mail`, `partage_*`. Seuls le nom et un titre lisible partent, jamais les réponses, le score ni les coordonnées.
- `suivre()` ne fait rien si le script n'est pas chargé (hors ligne, bloqueur de pub) et avale toute exception : la mesure ne peut pas casser le test.
- Le service worker ignore les requêtes d'autres origines : rien de GoatCounter n'est mis en cache par l'app.
- GoatCounter ne compte pas `localhost` (comportement du script) : les tests locaux ne polluent pas les statistiques.

### Partage (v1.3)
Zone « Partager mon score » juste sous le score (niveau et échelle), avant le détail par axe — remontée en v1.3.1 pour être vue au moment où l'on découvre son score (elle était après le bloc CTA, hors de vue pour la plupart des visiteurs mobiles). Si la mesure montre une baisse nette de `clic_rdv`, la redescendre après le bloc CTA. Contenu : 5 boutons ronds de 52 px, `aria-label` + `title` explicites, pictogrammes monochromes (`currentColor`, justes en clair et en sombre). LinkedIn en premier et en fond plein (prioritaire). Pictogrammes LinkedIn, Facebook, Instagram : paquet simple-icons (licence CC0), tracés intégrés dans le HTML, aucun appel externe.

| Icône | Comportement |
|---|---|
| LinkedIn | ouvre la fenêtre **« Votre post LinkedIn »** : post complet pré-rédigé à partir du résultat, **modifiable** (textarea). « Publier sur LinkedIn » : sur ordinateur, `feed/?shareActive=true&text=` ouvre l'éditeur LinkedIn pré-rempli avec le texte modifié (lien non officiel) ; sur mobile, feuille de partage du téléphone (texte → app LinkedIn), repli `share-offsite`. « Copier le texte » (confirmé). Lien « enregistrez l'image de votre score » (format publication) à joindre au post. |
| Facebook | `facebook.com/sharer/sharer.php?u=` (officiel, URL seule : Facebook interdit le texte pré-rempli) |
| Instagram | ouvre la fenêtre **« Partager sur Instagram »** : aperçu de l'image, choix **Story** (1080×1920) / **Publication** (1080×1350), défaut story sur mobile et publication sur ordinateur (Instagram n'y publie pas de stories). Mobile (partage de fichiers possible) : « Partager l'image » → feuille de partage (Instagram, « Enregistrer l'image ») + étapes. Ordinateur : « Télécharger l'image » + « Ouvrir Instagram » + 3 étapes, et une note si « Story » est choisi. |
| E-mail | `mailto:?subject=…&body=…` (objet `partage.mail_objet`, corps = texte court + URL) |
| Copier | presse-papiers **toujours confirmé** (voir ci-dessous) |

- **Post LinkedIn** (`postLinkedIn()`, logique pure, testée) : accroche par niveau (`niveaux[].accroche_linkedin`, score dans la 1re ligne, visible avant « voir plus ») ; présentation du test ; « Mon point fort : axe (x %) » et « Mon prochain chantier : axe » (sans pourcentage, pour ne pas exposer un 0 %) ; « Ce que j'en retiens » tiré de l'axe le plus faible (`partage.linkedin.enseignements[axe][profil]`) ; invitation ; lien ; 3 hashtags en fin. ~550 caractères. Lignes omises si sans objet (point fort à 0 %, chantier à 100 % ou identique au point fort). Modèle et textes dans `config.partage.linkedin`. Conçu avec le skill marketing `social` (accroche, retours à la ligne, hashtags en fin).
- **Copie** : `copierAvecConfirmation()`, seul chemin vers le presse-papiers : toast 3 s annoncé (`role="status" aria-live="polite"`, texte copié complet en `.sr-only`), couleurs inversées `--fill`/`--on-fill` (15,7:1). Depuis l'icône : coche verte + `aria-label` « Texte copié » 2 s, et panneau `#partage-panneau` avec le texte exact et un lien « Ouvrir LinkedIn ». Depuis la fenêtre LinkedIn : bouton « Copié ! » 2 s. Échec : « Copie impossible… », rien de marqué comme copié.
- **Fenêtres** : `<dialog>` natif (`showModal`), focus initial sur l'action principale (`autofocus`), fermeture par Échap, bouton « Fermer » ou clic sur le fond. **Chaque fenêtre a sa propre région live `.toast`** : un toast hors de la fenêtre serait masqué par son fond ; `afficherToast()` choisit celle de la fenêtre ouverte.
- **Images** : dessinées en canvas dans le navigateur (`FORMATS_IMAGE` : mise en page story et publication), préparées 1,5 s après l'affichage du résultat (format par défaut de l'appareil) pour que la feuille de partage suive le clic de près ; logo `img/logo-manica-baseline-clair-900.png` (pas de `ctx.filter`, absent de Safari < 18) ; aperçu en `blob:` (autorisé dans `img-src`) ; rien n'est envoyé.
- Textes : `config.partage.titre`, `.texte`, `.mail_objet`, `.linkedin.*`, et `niveaux[].accroche_linkedin`.
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
- 85 questions depuis la v2.0 : les 47 d'origine (8 par axe pour les axes 1–4 en `profil: tous`, axe 5 = 7 perso + 8 entreprise) + **38 ciblées** (validées par Cédric le 06/11/2026, `statut: valide` ; `statuts_publies` revient à `["valide"]`) : `dir-01…10` (`roles: ["dirigeant"]`), `dsi-01…10`, `mkt-01…10` (2 par axe chacun, profil `entreprise`), `perso-01…08` (2 par axe sur les axes 1–4, profil `perso`). Champ facultatif `roles` = ids de `config.roles`.
- Faits juridiques susceptibles de bouger, à revérifier lors des relectures périodiques : `dir-05` (recrutement « à haut risque »), `dir-08` (reconnaissance des émotions au travail, interdite depuis février 2025), `dir-09` (article 4 « maîtrise de l'IA » ; le paquet « Digital Omnibus » de novembre 2025 proposait de l'alléger), `mkt-09` (transparence des hypertrucages, article 50), `mkt-06` (droit d'auteur sur un visuel généré), `mkt-08` (avatar d'une salariée), `dsi-07` (Cloud Act / SecNumCloud). Proximités assumées : `dir-02`/`fond-08`, `dsi-06`/`don-07`, `dsi-09`/`ent-e02`, `perso-02`/`lim-08`.
- Apostrophes droites dans le JSON : l'app convertit à l'affichage (apostrophe courbe, espaces fines insécables avant `? ! : ; » %` et après `«`).
- Thèmes transverses demandés : gouvernance (`ent-e03`, `ent-e07`, `ent-e01`, `ent-p01`), agents et exécution locale (`fond-07`, `don-03`, `don-07`, `don-08`, `ent-e08`), open source / poids ouverts (`don-04`, `ent-e08`), shadow AI (`ent-p02`, `ent-e02`), formation vs accompagnement (`ent-e06`).
- **Noms d'outils** : Ollama et LM Studio cités dans l'explication de `don-03` ; OpenClaw et Hermes Agent (Nous Research) cités dans l'explication de `don-08` — vérifiés le 24/09/2026 (agents open source auto-hébergés, apparus fin 2025 / début 2026). Jamais dans les énoncés ni les réponses, pour que la question reste juste si un outil disparaît : seule l'explication serait à retoucher.
- Longueur des choix équilibrée pour ne pas trahir la bonne réponse (la plus longue dans ~23 % des questions, la plus courte dans ~19 %). `validate.mjs` alerte au-delà de 40 %.

### Tirage
- Pool = questions de l'axe, profil `tous` ou profil du rôle, statut dans `config.quiz.statuts_publies`, et, si la question porte un champ `roles`, seulement pour ces rôles (`questionAccessible`).
- **Orientation métier (v2.0)** : par axe, d'abord `quiz.questions_ciblees_par_axe` (1) question « ciblée » quand il y en a (`questionCiblee` : `roles` contient le rôle, ou question `profil: perso` pour « Pour moi »), puis complément à difficulté différente. Résultat : 5 questions sur 10 écrites pour le métier (Dirigeant·e, DSI, Marketing, Pour moi) ; « Autre métier » tire dans le tronc commun + entreprise.
- Par axe : `questions_par_axe` (2) questions de **difficultés différentes** — les niveaux (facile, moyen, avancé) sont pris dans un ordre aléatoire, une question par niveau tant que possible, puis complété au hasard. Avec 2 par axe, la paire de niveaux est donc aléatoire : **toutes les questions restent tirables**, y compris les « moyen » (l'ancienne règle « 1 facile + 1 avancée par axe » les aurait exclues). Avec 3 ou plus, chaque axe a les 3 niveaux.
- Les 10 questions sont ensuite mélangées puis triées par difficulté (faciles → moyennes → avancées) : le test monte en puissance, les axes restent entremêlés.
- Mesuré sur 10 000 tirages par profil : chaque question apparaît dans 16 à 34 % des tests (les « moyen », 4 par axe, un peu moins souvent que les faciles et avancées, 2 par axe) ; en moyenne 3,3 questions de chaque niveau par test ; 0,3 % des tests sans question facile.
- Ordre des 4 choix mélangé à chaque question.

### Score
- Score /100 = part de bonnes réponses (`round(100 × bonnes / nombre de questions)`), indépendant du nombre de questions. Avec 10 questions : multiples de 10, donc seuils effectifs 0–30 Découverte, 40–60 Curieux, 70–80 Pratiquant, 90–100 Avancé.
- Score par axe = bonnes / 2, en % (0, 50 ou 100 %).
- Niveau = dernier niveau dont `min` ≤ score.
- 3 priorités = 3 axes au plus faible %. Les égalités sont fréquentes avec 2 questions par axe : elles sont départagées par la **lacune** (question ratée pondérée : facile 3, moyen 2, avancé 1 — rater une question facile signale une lacune plus nette), puis par l'ordre des axes dans `config.json`.

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
Indicateur clé : taux de clic CTA = (`clic_rdv` + `clic_mail` + `copie_adresse`) / `test_termine` (`copie_adresse` depuis la v1.5). Taux de complétion = `test_termine` / `test_demarre`. Partage : somme des `partage_*` / `test_termine`, et répartition par réseau.
**Mesure en cours (v1.3.1, 24/09/2026)** : partage remonté près du score. Comparer 2 à 3 semaines avant et après, sur le taux de partage (`partage_*` / `test_termine`) et surtout le taux de RDV (`clic_rdv` / `test_termine`). Trafic trop faible pour un test A/B : comparaison avant/après seulement.

---

## 8. État d'avancement

- ✅ v2.1 (06/11/2026, déployée sur GitHub Pages) : refonte visuelle alignée sur la refonte du site manica.fr (direction « Graphite & Ambre », `~/www/manica`, branche `refonte/astro`, `docs/guide-graphique.md`). Police Geist + Geist Mono (OFL, `fonts/`), jetons graphite (clair `#F4F5F5`/encre `#15191C`, sombre = sections sombres du site), ambre réservé à l'action, fond de plan quadrillé et lueur ambrée, grain (`img/grain.png`), bloc RDV à circuits (`img/fond-circuits.webp`). Mobile d'abord, puis **mise en page bureau (≥ 1024 px)** : accueil en deux colonnes (texte + choix du profil / illustration SVG animée du parcours : 10 réponses → score → diagnostic par axe → e-mail + échange offert), « Ce que vous obtenez » et « Qui est derrière + FAQ » en deux colonnes, quiz en carte centrée, résultat avec la carte du score collante à gauche et le formulaire puis le diagnostic à droite ; filets pointillés et repères « + » au-delà de 1280 px. Mouvement en CSS seul : entrée en cascade à chaque écran, remplissage des boutons au survol, cartes de profil qui se soulèvent, apparitions au défilement (`animation-timeline: view()`, sans effet si non pris en charge), scène d'illustration jouée une fois ; `prefers-reduced-motion` → état final statique. En-tête pleine largeur avec le logo compact sur tous les écrans (le logo à baseline n'est plus affiché). Image de partage (canvas) passée en graphite + Geist. Reste en bleu nuit : `og-image.png` (à régénérer via `tools/og-image.html`).

- ✅ v2.0 (06/11/2026, déployée sur GitHub Pages) : refonte « tunnel de conversion » d'après le coaching Funnel Building du 30/09/2026 — profils métier en un clic, quiz en 1 clic par question (10 clics au lieu de 19), corrigé à la fin, score libre puis diagnostic contre nom + e-mail (leads → Google Sheet via Apps Script, e-mail de notification et récapitulatif), code couleur par axe, bloc RDV à un seul bouton + réassurance, agenda Google intégré dans une fenêtre, bulle RDV avec photo, « Qui est derrière » + FAQ en accordéon sur l'accueil et le résultat, partage réduit, 38 questions ciblées (à valider), événements GoatCounter du tunnel, mentions légales réécrites (données collectées, Google Workspace, 3 ans). `validate.mjs` et `e2e.mjs` réécrits en conséquence (5 parcours par rôle, échec d'envoi, robot, copie refusée, stockage bloqué, hors ligne). Même jour : Apps Script déployé par Cédric (Google Sheet « leads », onglet `Leads`, URL dans `config.leads.url`, `doGet` vérifié), 38 questions passées à `valide`, `statuts_publies: ["valide"]` (plus de bandeau bêta), `a_propos.linkedin` renseigné, preuve reformulée sans durée chiffrée (« plusieurs années », pour ne pas vieillir). Après le premier test réel : l'envoi contient le corrigé complet ; Apps Script envoie des e-mails HTML (notification + récapitulatif) avec le diagnostic en PDF joint, et la colonne « Réponses » de la feuille détaille chaque question. Agenda Google : pas de pré-remplissage possible par l'adresse (nom et e-mail pré-remplis seulement si le visiteur est connecté à Google) ; alléger le formulaire de réservation côté Google Agenda. Premier lead réel testé de bout en bout par Cédric (ligne dans la feuille, notification et récapitulatif HTML avec PDF). **Reste à faire** : tester l'agenda intégré sur téléphone.

- ✅ v1.0 (24/09/2026) : app complète, PWA installable et hors ligne, 47 questions `a_valider`, config, icônes, image OG, validation automatisée, déployée sur GitHub Pages.
- ✅ v1.5 (25/09/2026) : passe d'audit (skills `redesign-existing-projects` et `mobile-native`) appliquée — mentions légales et confidentialité (données officielles Manica Labs, refus de la mesure d'audience), photo et fonction de Cédric dans le bloc RDV, indication du score à la réservation, adresse e-mail copiable, page 404, couche mobile (survol, tap, appui long, zoom iOS, défilement des fenêtres), titres sans mot isolé, état de chargement sur « Commencer », « by Manica » retiré de l'accueil, test de bout en bout remis dans le repo (`tools/e2e.mjs`). Non appliqué volontairement : déplacer le bloc RDV (attendre la mesure en cours, §7), changer d'outil de réservation (décision de Cédric).
- ✅ v1.4 (24/09/2026) : test raccourci à **10 questions** (2 par axe, difficultés différentes), banque de 47 conservée pour la rotation ; score en part de bonnes réponses ; priorités départagées par la lacune ; textes « 10 questions, 3 minutes » partout (accueil, meta, manifeste, image OG régénérée, partages, post LinkedIn). `validate.mjs` vérifie désormais que tout texte annonçant « N questions » ou « N axes » correspond au tirage réel.
- ✅ v1.3.1 (24/09/2026) : icônes de partage remontées sous le score (visibles sans défiler sur mobile et sur ordinateur), plus de doublon en bas de page ; mesure avant/après en cours (§7).
- ✅ v1.3 (24/09/2026) : partage LinkedIn en post complet pré-rédigé (personnalisé, modifiable, copie confirmée, image jointe possible) et partage Instagram guidé (fenêtre avec aperçu, choix Story/Publication, étapes adaptées à l'appareil) au lieu d'un téléchargement brut. Testé : contenu du post (6 000 tirages + cas 0/100 et 100/100), publication avec le texte modifié, copie et toast dans la fenêtre, images story et publication (dimensions), format par défaut, Échap, focus, clair/sombre, mobile/ordinateur. Toujours à vérifier sur téléphone : la feuille de partage native.
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

- ~~Capture de lead intégrée avec consentement RGPD~~ : fait en v2.0 (Apps Script + Google Sheet).
- Recommandations par métier (aujourd'hui par profil perso / entreprise seulement).
- Landing pages par persona (pub DSI / dirigeant / marketing) : paramètre d'adresse `?profil=dsi` qui présélectionne le rôle, et promesse alignée sur la pub.
- Newsletter / séquence e-mail pour les leads ayant coché « lives et contenus ».
- Rapport PDF téléchargeable.
- Mode équipe (lien dirigeant → synthèse anonymisée).
- Questions à niveau adaptatif.
- Version anglaise.
- Élargissement de la banque (gouvernance, agents locaux, open source) après les premiers retours ; révision tous les 2–3 mois (vérifier en priorité les explications de `don-03` et `don-08`, qui citent des outils).

---

## 10. Pièges connus & conventions

- **Test de bout en bout** : `(cd tools && npm install)` une fois, puis `node tools/e2e.mjs` (local, serveur intégré) ou `BASE=https://checkup-ia.manica.fr/ node tools/e2e.mjs` (prod). Captures dans `tools/.e2e-captures/`. Il vivait dans un dossier temporaire jusqu'à la v1.4 et a été perdu une fois : il reste dans le repo.
- **Mentions légales** : à tenir à jour si l'entreprise change (siège, capital, dirigeant). Sources du 25/09/2026 : annuaire des entreprises (API recherche-entreprises.api.gouv.fr), Pappers, Societe.com. Relecture juridique conseillée.
- **404.html** : `<base href="/">` (domaine personnalisé) ; `validate.mjs` vérifie qu'il suit le chemin de `url_app`, et que `CNAME` contient son domaine.
- **Avant tout push** : `node tools/validate.mjs` doit afficher `✓ Validation OK` (il extrait le `<script>` inline et lance `node --check`, valide les JSON, simule les tirages avec la vraie logique d'`index.html` entre les marqueurs `// === LOGIQUE PURE` et `// === FIN LOGIQUE PURE ===`).
- **Garder la logique pure sans DOM** entre ces marqueurs, sinon `validate.mjs` ne peut plus l'évaluer.
- **Valider des questions** : passer `statut` à `valide`. Pour ne publier que les questions relues, mettre `"statuts_publies": ["valide"]` dans `config.json` — `validate.mjs` vérifie alors que chaque pool garde ≥ `questions_par_axe` questions sur au moins autant de niveaux de difficulté (2 aujourd'hui), et signale un niveau absent.
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
- **Nombre de questions** : il se règle dans `config.quiz.questions_par_axe` (× 5 axes). Les textes qui l'annoncent (accueil, meta, manifeste, `tools/og-image.html` puis `og-image.png`, `config.partage`, README) doivent suivre — `validate.mjs` échoue sinon. Penser à régénérer `og-image.png` et à rafraîchir l'aperçu LinkedIn (Post Inspector).
- **Toast et fenêtres** : un `<dialog>` ouvert est dans la couche supérieure ; tout message doit s'afficher dans sa propre région `.toast` (déjà géré par `afficherToast()`). Toute nouvelle fenêtre doit contenir la sienne.
- **Post LinkedIn** : max 3 000 caractères, ~210 visibles avant « voir plus » ; garder le score dans la première ligne. `validate.mjs` le vérifie sur tous les tirages.
- **Nouveau réseau de partage** : lien officiel si possible, pictogramme monochrome `currentColor`, `aria-label` + `title`, événement `partage_<réseau>` ajouté à `TITRES_EVENEMENTS`, et jamais de copie presse-papiers implicite (règle ci-dessous).
- **Wording formation vs accompagnement** : accompagnement par défaut.
- **Noms d'outils IA** : jamais dans un énoncé ou une réponse sans vérification ; de préférence dans l'explication seulement.

---

## 11. Checklist de démarrage de session

1. Lire ce CDC, puis `index.html`, `config.json`, `questions.json`.
2. Vérifier l'accès push (`gh auth status`, `git ls-remote origin`). Sinon, demander un token classique scope `repo`.
3. Points encore ouverts côté Cédric :
   - prévenir le coach Funnel Building de la mise à jour (demandé en coaching) ;
   - validation ou correction de la palette ;
   - logo vectoriel (SVG) si disponible, pour une netteté parfaite à toute taille ;
   - outil de réservation : garder Google Agenda (score indiqué à la main) ou passer à Cal.com / Calendly (pré-remplissage profil + score) ;
   - après la mesure du partage (§7) : décider s'il faut rapprocher le bloc RDV du haut de page ;
   - confirmation du wording « accompagnement » ;
   - domaine personnalisé ou non ;
4. Après chaque déploiement : mettre à jour §8 de ce document.

Ce projet reste un bon candidat de POC en direct pour Le Café Tech Manica : score calculé dans le navigateur, et une seule requête sortante (vers Apps Script) quand le visiteur demande son diagnostic, vérifiable dans l'onglet Réseau des outils de développement.
