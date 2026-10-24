# YT Beat M

Bibliothèque personnelle de prods YouTube : importer une prod, la retrouver par sa pochette ou ses tags, l'écouter et afficher son MP3 dans le gestionnaire de fichiers.

**Statut : import YouTube, catalogue portable, fiches détaillées et écoute locale disponibles.** L'interface permet de créer/ouvrir une bibliothèque, d'importer une vidéo, d'indexer ses MP3, de rechercher et de gérer ses favoris. L'édition des métadonnées et les filtres musicaux avancés restent à venir (#6).

## Installer et lancer

Prérequis sur chaque ordinateur : [uv](https://docs.astral.sh/uv/getting-started/installation/), [Node.js 24 LTS](https://nodejs.org/) et [FFmpeg/ffprobe](https://ffmpeg.org/download.html) dans le PATH. uv installe Python 3.13 si nécessaire. Les mêmes commandes fonctionnent dans un terminal Mac et dans PowerShell Windows, depuis la racine du dépôt :

```sh
uv sync --locked
npm --prefix frontend ci
npm --prefix frontend run build
uv run yt-beat-m doctor
uv run yt-beat-m serve
```

Le navigateur s'ouvre sur `http://127.0.0.1:8765`. Le terminal doit rester ouvert ; **Ctrl+C** arrête le moteur. `doctor` retourne un code 1 et un conseil si un prérequis manque. Le diagnostic ne télécharge aucune vidéo. Utiliser `serve --no-browser` pour un lancement sans ouverture du navigateur. `serve --port 8766` permet de changer de port.

En développement, utiliser deux terminaux : `uv run yt-beat-m serve --dev --no-browser` et `npm --prefix frontend run dev`, puis ouvrir `http://127.0.0.1:5173`.

## Ouvrir une bibliothèque

Dans l'interface, coller le chemin absolu du dossier et choisir **Ouvrir** pour une bibliothèque existante, ou **Créer** pour un dossier nouveau/vide. Le parent du dossier doit exister ; aucun média existant n'est scanné ou modifié. Un dossier non vide n'est pas écrasé.

Le dossier contient `library.json`, `catalog.sqlite3` et les sous-dossiers `audio`, `artwork`, `staging`, `backups`. Le catalogue utilise des chemins relatifs ; seule la préférence locale de sélection contient le chemin absolu. Cette préférence se trouve dans le dossier de configuration utilisateur déterminé par platformdirs (`yt-beat-m/preferences.json`). Elle conserve aussi l'identifiant de la bibliothèque pour détecter un remplacement inattendu du dossier.

La dernière bibliothèque est rouverte au lancement si elle reste accessible. Un disque absent donne un message explicite et ne crée aucun catalogue vide. Fermer la bibliothèque libère le verrou pour cette session et conserve le choix pour le prochain lancement. Pour changer de machine : fermer le moteur avec Ctrl+C, éjecter le disque puis ouvrir le même dossier sur l'autre poste. Le fichier `.library.lock` peut rester présent : le verrou dépend du processus actif, pas de la présence du fichier.

Une sauvegarde cohérente du catalogue est créée dans `backups` avant une migration. Le journal SQLite est en mode DELETE, avec synchronisation FULL. Les bibliothèques sur partage réseau et les liens symboliques internes ne sont pas pris en charge. Le transfert sur le disque physique de l'utilisateur reste à valider dans l'issue #8 ; la CI ne constitue pas cette recette matérielle.

## Importer une vidéo YouTube

Ouvrir une bibliothèque, coller une URL YouTube dans **Une nouvelle prod ?**, puis cliquer sur **Importer la prod**. Une vidéo par import : les liens courts et classiques sont acceptés ; un paramètre de playlist dans un lien vidéo n'importe que cette vidéo. L'import de playlists complètes reste hors de cette version.

Le traitement continue en arrière-plan : attente, lecture des informations, téléchargement, conversion, vérification, puis disponibilité dans la grille. Le pourcentage affiché vient du téléchargeur ; aucun pourcentage de conversion n'est inventé. Le MP3 et une éventuelle pochette JPEG sont locaux, avec titre, chaîne, publication, description et métadonnées musicales explicites quand disponibles. La chaîne n'est pas automatiquement traitée comme beatmaker.

Les limites initiales sont 30 minutes par vidéo, 100 Mo à la récupération et un délai de téléchargement de 10 minutes. Les vidéos privées, directs en cours et cookies de navigateur ne sont pas pris en charge. Node, FFmpeg et ffprobe sont requis. Les composants EJS sont fournis par les dépendances verrouillées de yt-dlp.

Une même vidéo ne peut être en cours qu'une fois et n'est pas réimportée si elle est déjà au catalogue. Après erreur ou arrêt, utiliser **Réessayer**. Avant fermeture de la bibliothèque, le moteur arrête l'import et ses sous-processus. La reprise nettoie uniquement les fichiers générés qu'elle peut identifier par nom, empreinte et absence de référence au catalogue ; les originaux et les prods prêtes sont conservés.

### Mettre à jour le téléchargeur

Si YouTube change son fonctionnement, mettre à jour yt-dlp/EJS dans une branche avec `uv lock --upgrade-package yt-dlp --upgrade-package yt-dlp-ejs`, puis `uv sync --locked`. Exécuter les contrôles et un essai réel avant de conserver le nouveau lockfile. Le moteur ne s'auto-met pas à jour au lancement. Le diagnostic indique les versions actives.

## Voir et écouter un MP3 local

Déposer un MP3 directement dans le sous-dossier `audio` de la bibliothèque ouverte, puis cliquer sur **Actualiser les fichiers**. Le titre vient du tag ID3 s'il existe, sinon du nom du fichier. La pochette intégrée est affichée si elle est au format JPEG/PNG ; une tuile de remplacement est utilisée sinon. Les fichiers restent à leur emplacement et ne sont pas modifiés. Un nouvel indexage ne crée pas de doublon pour un même chemin.

La carte permet de lancer l'écoute dans un lecteur unique avec pause, déplacement dans la piste et volume. Le lecteur apparaît sans démarrer automatiquement la lecture. L'indexage porte sur les MP3 directement présents dans `audio`, sans sous-dossiers ; les fichiers invalides sont signalés. Les modifications de tags d'un fichier déjà indexé ne sont pas resynchronisées dans cette première tranche.

## Parcourir sa collection

Rechercher un titre, un beatmaker ou une chaîne, sans distinction de casse ni d'accents. Plusieurs mots se combinent et le bouton **Favoris uniquement** se combine à la recherche. Le cœur enregistre le favori dans le catalogue portable ; il est conservé au redémarrage. La grille charge 48 prods à la fois, avec **Afficher plus de prods**. Les cartes gardent leurs éléments alignés : le titre reste sur une ligne et défile au survol ou au focus clavier seulement lorsqu’il dépasse. La préférence de réduction des animations est respectée ; le titre complet reste disponible dans l’infobulle et la fiche.

**Détails** ouvre une pop-up centrée et adaptée à la fenêtre avec durée, BPM, tonalité, dates de publication et d'ajout, chaîne, beatmaker et liens de la description. Les valeurs absentes restent indiquées comme non renseignées. La description s'affiche comme texte, sans exécuter de HTML. Le contenu défile à l’intérieur tandis que le bouton de fermeture reste accessible. Échap ferme la fiche et rend le focus à son bouton. Rechercher, filtrer ou consulter une fiche laisse la piste en cours continuer.

## Vérifier

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend exec playwright install chromium
npm --prefix frontend run test:e2e
```

Les mêmes contrôles tournent dans GitHub Actions sur Mac et Windows. Playwright démarre un moteur isolé sur le port 8767 avec une bibliothèque temporaire, un son synthétique et un téléchargement simulé ; les médias et préférences personnels ne sont pas utilisés. Les parcours couvrent clavier, description non fiable, favoris persistants, import/doublon, recherche pendant la lecture et consultation avec les requêtes Internet bloquées. Les versions des dépendances sont fixées par `uv.lock` et `frontend/package-lock.json` ; utiliser `--locked` et `npm ci`. Environnement local initial vérifié : Python 3.13.5 et Node 24.11.1.

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

La stack est React + TypeScript + Vite, Python + FastAPI et yt-dlp + FFmpeg ; SQLite porte le catalogue portable. Les décisions sont détaillées dans l'architecture.

## Suivi GitHub

- [Issues](https://github.com/kylliandelbauche/yt-beat-m/issues)
- [Jalons](https://github.com/kylliandelbauche/yt-beat-m/milestones)
- [Kanban](https://github.com/users/kylliandelbauche/projects/2) : Open, In progress, In review, Done, Closed.

`Done` signifie livré ; `Closed` signifie fermé sans livraison. Le statut de l'issue GitHub (open/closed) et la colonne du kanban sont deux informations distinctes. Le déplacement s'effectue avec `python3 scripts/project_status.py NUMERO "In progress"`, puis `"In review"` et `"Done"`.

Le suivi de temps et tokens demandé par l'utilisateur est conservé dans un commentaire de chaque issue. Voir [les instructions de suivi](AGENTS.md). `python3 scripts/worklog.py start NUMERO` relève la borne initiale ; `finish NUMERO --publish --note "Résultat et vérifications"` publie la durée et les compteurs disponibles. Les bornes brutes restent dans `.local/`, exclu de Git ; les journaux de conversation ne sont jamais publiés. La configuration du kanban et l'amorçage avant le premier relevé ne sont pas imputés rétroactivement à une issue.

Le MVP vise une vidéo par import. Les playlists, l'enrichissement depuis les marketplaces, l'analyse audio par IA et le suivi des morceaux sont prévus après le MVP.

Les fichiers personnels et les bibliothèques audio restent hors du dépôt Git.
