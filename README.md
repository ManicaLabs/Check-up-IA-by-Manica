# Check-up IA by Manica

Test gratuit en ligne : 10 questions sur 5 axes adaptées au métier (tirées dans une banque de 85), un score sur 100 affiché tout de suite, puis un diagnostic détaillé contre nom + e-mail, et un échange de 30 min réservable dans la page.
Score calculé dans le navigateur ; le diagnostic détaillé se débloque avec nom + e-mail (contacts reçus dans une Google Sheet, voir docs/LEADS.md).

**App** : https://checkup-ia.manica.fr/

## Modifier le contenu

- Questions : `questions.json` (passer `statut` à `valide` après relecture)
- Profils, lien de rendez-vous, adresse de réception des leads, niveaux, recommandations, FAQ, textes : `config.json`
- Réception des contacts (Google Sheet) : `docs/LEADS.md`

Puis valider avant de pousser :

```bash
node tools/validate.mjs
# Test de bout en bout dans Chrome (une fois : cd tools && npm install)
node tools/e2e.mjs
```

## Tester en local

```bash
python3 -m http.server 8000
# puis http://localhost:8000/
```

## Déployer

`git push origin main` : GitHub Pages publie automatiquement (~1 min, cache ~10 min).

Documentation complète : [docs/CDC.md](docs/CDC.md).
