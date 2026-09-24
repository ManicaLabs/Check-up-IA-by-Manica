# Check-up IA by Manica

Test gratuit en ligne : 20 questions sur 5 axes, un score sur 100, des recommandations, et une prise de contact avec Manica.
Zéro backend, zéro donnée collectée : tout est calculé dans le navigateur.

**App** : https://manicalabs.github.io/Check-up-IA-by-Manica/

## Modifier le contenu

- Questions : `questions.json` (passer `statut` à `valide` après relecture)
- Lien de rendez-vous, email, niveaux, recommandations, textes : `config.json`

Puis valider avant de pousser :

```bash
node tools/validate.mjs
```

## Tester en local

```bash
python3 -m http.server 8000
# puis http://localhost:8000/
```

## Déployer

`git push origin main` : GitHub Pages publie automatiquement (~1 min, cache ~10 min).

Documentation complète : [docs/CDC.md](docs/CDC.md).
