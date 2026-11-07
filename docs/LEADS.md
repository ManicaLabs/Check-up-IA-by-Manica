# Réception des contacts (leads) dans une Google Sheet

Depuis la v2, le visiteur voit son score librement, puis laisse son nom et son e-mail pour débloquer son diagnostic détaillé. Ces informations partent vers une **application web Google Apps Script** qui les range dans une Google Sheet, vous prévient par e-mail et envoie au visiteur son diagnostic.

Le code est dans [`tools/apps-script/Code.gs`](../tools/apps-script/Code.gs).

## Installation (une seule fois, environ 5 minutes)

1. Créez une Google Sheet avec le compte Google de Manica, par exemple « Check-up IA — leads ».
2. Menu **Extensions → Apps Script**.
3. Remplacez tout le contenu de `Code.gs` par celui de `tools/apps-script/Code.gs`. Vérifiez en haut du fichier `NOTIFIER` (destinataire des notifications) et `ENVOYER_RECAP`. Enregistrez.
4. Dans la liste des fonctions, choisissez `installer`, puis **Exécuter**. Google demande les autorisations (feuille de calcul, envoi d'e-mails) : acceptez. L'onglet « Leads » est créé.
5. **Déployer → Nouveau déploiement** → type **Application web** :
   - Exécuter en tant que : **Moi** ;
   - Qui a accès : **Tout le monde**.
6. Copiez l'**URL de l'application web** (elle finit par `/exec`) et collez-la dans `config.json` :

   ```json
   "leads": { "url": "https://script.google.com/macros/s/…/exec", "recap_par_mail": true }
   ```

7. Vérification : ouvrez cette URL dans un navigateur, elle doit afficher `{"ok":true,"service":…}`. Puis `node tools/validate.mjs`, et un test complet sur le site.

## Ce que vous recevez

- **Notification** (à `NOTIFIER`) : e-mail mis en forme avec le contact, le profil, la case lives, la source, le score, les axes, les 3 priorités et le corrigé question par question. « Répondre » écrit directement au visiteur. Le diagnostic est joint en PDF pour le suivi.
- **Récapitulatif au visiteur** : le même diagnostic complet (score, axes, priorités, corrigé avec explications), un bouton de réservation, et le PDF joint.
- **Feuille** : une ligne par contact ; la colonne « Réponses » liste chaque question (✓/✗, axe, énoncé, réponse donnée, bonne réponse).
- Pour voir les e-mails sans passer par le site : fonction `testerEmails` dans l'éditeur → **Exécuter** (envoie un exemple des deux e-mails à `NOTIFIER`, sans écrire dans la feuille).

## Modifier le script plus tard

Après toute modification de `Code.gs` dans l'éditeur : **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'URL reste la même, rien à changer dans `config.json`.

## Ce qui est envoyé

`donneesLead()` dans `index.html` : id unique, date, nom, e-mail, case « lives et contenus », profil (rôle + métier précisé), score, niveau, bonnes réponses, pourcentage par axe, 3 priorités (titre + texte, pour l'e-mail récapitulatif), corrigé complet (pour chaque question : axe, énoncé, réponse donnée, bonne réponse si ratée, explication), paramètres `utm_*` de l'adresse et site d'origine, page.

## Comportement côté test

- Le diagnostic s'affiche **immédiatement** après le clic : l'envoi se fait en arrière-plan, le visiteur n'attend jamais Google.
- Envoi en `text/plain` (requête simple, sans pré-vérification CORS). Si la réponse n'est pas lisible, nouvel essai en `no-cors` ; le script ignore un id déjà reçu, donc pas de doublon.
- Échec réseau : le contact est gardé sur l'appareil (`checkup-ia:lead-en-attente`) et renvoyé à la visite suivante.
- Champ piège invisible (`site`) : s'il est rempli (robot), rien n'est envoyé.
- `leads.url` vide : le formulaire fonctionne, mais rien n'est transmis (`validate.mjs` le signale).
- Mesure (GoatCounter, sans donnée personnelle) : `formulaire_vu`, `lead_envoye`, `lead_echec`.

## Quotas Google

Apps Script envoie jusqu'à 100 e-mails par jour avec un compte Gmail gratuit, 1 500 avec Google Workspace. Chaque lead consomme 2 e-mails (notification + récapitulatif). Au-delà, l'enregistrement dans la feuille continue ; seuls les e-mails s'arrêtent jusqu'au lendemain.

## RGPD

- Base légale : la demande du visiteur (il demande son diagnostic) ; la case « lives et contenus » est un consentement distinct, décochée par défaut.
- Conservation conseillée : 3 ans après le dernier contact (recommandation CNIL pour la prospection), puis suppression des lignes.
- Sous-traitant : Google (Workspace). Les mentions légales (`mentions-legales.html#vos-donnees`) décrivent tout cela ; à tenir à jour si l'outil change.
