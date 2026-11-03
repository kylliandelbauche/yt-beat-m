# Contribuer

1. Lire le cadrage, l'architecture proposée et les critères de l'issue.
2. Créer une branche courte liée à l'issue ; garder chaque changement reviewable.
3. Implémenter le périmètre accepté et vérifier les scénarios touchés.
4. Ouvrir une pull request avec problème, comportement obtenu, vérifications et limites. Lier l'issue.
5. Fusionner lorsque les critères et les vérifications pertinentes sont satisfaits. Mettre à jour la documentation si le comportement ou une décision change.

Les choix techniques restent discutables : consigner une modification substantielle dans l'architecture, avec son motif et ses conséquences, avant de disperser la nouvelle approche dans le code.

Ne pas ajouter de tests qui recopient simplement l'implémentation. Privilégier les garanties utilisateur : fichiers conservés, imports récupérables, lecture fonctionnelle, annotations persistantes et portabilité.

Appliquer le suivi de temps, tokens et quotas décrit dans [AGENTS.md](AGENTS.md) pour chaque issue. Ne pas présenter les fonctionnalités futures comme déjà exécutables.

## Développement local

React · TypeScript · Vite · Python · FastAPI · SQLite · yt-dlp · FFmpeg.

Une fois l'environnement de développement préparé, lancer dans deux terminaux :

```sh
uv run yt-beat-m serve --dev --no-browser
```

```sh
npm --prefix frontend run dev
```

Ouvrir ensuite `http://127.0.0.1:5173`. Les choix techniques sont décrits dans [l'architecture](docs/architecture.md).

## Vérification

Exécuter les contrôles pertinents pour le changement :

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend exec playwright install chromium
npm --prefix frontend run test:e2e
```

Les tests navigateur utilisent une bibliothèque temporaire et de l'audio synthétique. Les validations sont locales par défaut ; GitHub Actions reste manuel et ne doit pas être lancé sans demande explicite.
