# YT Beat M

Bibliothèque personnelle de prods YouTube : importer une prod, la retrouver par sa pochette ou ses tags, l'écouter et afficher son MP3 dans le gestionnaire de fichiers.

**Statut : cadrage et planification. Aucune application exécutable à ce stade.**

## Expérience visée

1. Lancer le moteur local sur Mac ou Windows et ouvrir son interface dans le navigateur.
2. Ouvrir la bibliothèque du disque interne ou externe.
3. Coller un lien YouTube et suivre l'import du MP3 et de sa pochette.
4. Parcourir la grille, rechercher une ambiance, filtrer et écouter directement.
5. Cliquer sur « Afficher dans le dossier », puis glisser le MP3 dans son logiciel de musique.

L'application et ses dépendances sont installées sur chaque ordinateur. Les MP3, pochettes, tags et favoris voyagent ensemble dans le dossier de bibliothèque. Une bibliothèque s'utilise sur un ordinateur à la fois, après arrêt du moteur et éjection du disque avant transfert.

## Documents

- [Périmètre et parcours du MVP](docs/product.md)
- [Architecture proposée et décisions techniques](docs/architecture.md)
- [Plan de livraison, backlog et critères de validation](docs/delivery.md)
- [Méthode de contribution](CONTRIBUTING.md)

La stack proposée est React + TypeScript + Vite, Python + FastAPI, SQLite et yt-dlp + FFmpeg. Le choix détaillé et ses limites sont documentés avant le développement. Les versions exactes et fichiers de verrouillage seront ajoutés dans l'issue de fondation.

## Suivi GitHub

- [Issues](https://github.com/kylliandelbauche/yt-beat-m/issues)
- [Jalons](https://github.com/kylliandelbauche/yt-beat-m/milestones)

Le MVP vise une vidéo par import. Les playlists, l'enrichissement depuis les marketplaces, l'analyse audio par IA et le suivi des morceaux sont prévus après le MVP.

Les fichiers personnels et les bibliothèques audio restent hors du dépôt Git.
