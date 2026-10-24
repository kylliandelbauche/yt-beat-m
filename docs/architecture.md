# Architecture proposée

Statut : proposition de référence pour le MVP, à éprouver par une tranche fonctionnelle avant de multiplier les écrans. Aucun code applicatif n'est encore livré.

## Composants

| Composant | Choix proposé | Raison |
| --- | --- | --- |
| Interface | React, TypeScript, Vite, CSS avec variables de design | Grille et lecteur interactifs, typage et styles maîtrisés sans imposer un serveur de rendu |
| Moteur local | Python 3.13, FastAPI, Pydantic, uv | API typée, accès aux fichiers et proximité avec l'écosystème yt-dlp |
| Catalogue | SQLite via sqlite3, migrations SQL versionnées | Un catalogue local transportable, sans service de base de données séparé |
| Import | yt-dlp avec dépendances `default`, FFmpeg/ffprobe | Extraction de métadonnées, récupération audio et conversion MP3 |
| Runtime JavaScript | Node.js 24 LTS | Utilisé pour le frontend et explicitement configuré pour les challenges YouTube de yt-dlp |
| Vérification | pytest, Ruff, TypeScript/ESLint, Playwright | Tester les opérations sur fichiers, les erreurs d'import, l'audio et les parcours utilisateur |

Les versions exactes seront choisies et verrouillées dans `uv.lock` et `package-lock.json` dans l'issue de fondation, après vérification de leur compatibilité. Pas de dépendances à `latest` lors d'une exécution normale.

## ADR-001 — Navigateur et moteur local

Décision proposée : un processus local sert l'API et le frontend compilé sur la même origine, lié à `127.0.0.1`. En développement, Vite relaie `/api` au moteur local. Le navigateur affiche l'interface ; le moteur télécharge, stocke et localise les fichiers.

L'application s'installe sur chaque machine, le dossier de données voyage. Les lanceurs Mac et Windows ouvrent le navigateur et affichent les diagnostics de dépendances. Les premières versions peuvent demander une installation documentée de Python/uv, Node et FFmpeg. Un exécutable autonome tout inclus ne fait pas partie du MVP.

Ce choix évite un hébergement distant pour les fichiers personnels. Il demande néanmoins un moteur en fonctionnement pendant l'utilisation et une installation sur chaque poste. La future distribution pourra être réévaluée sans changer le format de la bibliothèque.

## ADR-002 — Bibliothèque transportable

```text
MaBibliotheque/
  library.json                 # identifiant et version du format
  catalog.sqlite3              # catalogue, tags, favoris, tâches
  audio/<uuid>.mp3
  artwork/<uuid>.jpg
  staging/<job-uuid>/           # fichiers temporaires non publiés
  backups/                     # sauvegardes avant migration
```

Tous les chemins persistés dans le catalogue sont relatifs, utilisent `/` et ne contiennent ni lettre de lecteur Windows ni point de montage Mac. Ils sont résolus sous la racine configurée. Les noms physiques fondés sur UUID évitent caractères interdits Windows, titres trop longs et collisions. Le titre affiché reste indépendant du nom physique.

La racine absolue sélectionnée est une préférence propre à chaque machine, en dehors du catalogue portable. L'identifiant de bibliothèque permet de vérifier que le dossier réouvert est le bon. Un dossier inaccessible ne doit jamais provoquer la création silencieuse d'un catalogue de remplacement.

Une seule instance du moteur utilise une bibliothèque à la fois : verrou de processus multiplateforme maintenu pendant la session, récupération sûre après arrêt anormal. SQLite en mode journal DELETE et `synchronous=FULL` pour commencer ; vérifier la prise de verrou sur le système de fichiers réel du disque. Pas de bibliothèque sur partage réseau pour le MVP.

Avant migration : sauvegarde SQLite cohérente via l'API de sauvegarde, puis migration transactionnelle. Refuser une version de format plus récente que celle comprise par le moteur. Le transfert consiste à arrêter le moteur, éjecter proprement le disque et ouvrir le même dossier sur l'autre machine. Aucune synchronisation simultanée entre ordinateurs n'est prévue.

La compatibilité du format ne garantit pas la fiabilité de n'importe quel disque : la recette doit couvrir le système de fichiers réellement utilisé par l'utilisateur. Ne pas reformater son disque. En cas de déconnexion, arrêter les écritures et présenter une erreur récupérable.

## Modèle minimal

- `beats` : UUID, identifiant YouTube unique, URL source canonique, titre, chaîne, beatmaker optionnel, durée, publication YouTube optionnelle, ajout UTC, BPM optionnel, tonalité optionnelle, favori, chemins audio/pochette relatifs, description source, provenance des champs extraits.
- `tags` et `beat_tags` : libellé normalisé et type `style` ou `mood`, relations multiples.
- `source_links` : URL candidate de page d'achat, libellé, provenance et correction éventuelle.
- `import_jobs` : UUID, identifiant source, état, étape, progression disponible, message d'erreur, dates et beat créé.
- `schema_migrations` : versions de schéma appliquées.

La publication YouTube est une date et non un instant UTC fabriqué. L'ajout et les événements techniques utilisent des instants UTC. Les tags libres restent éditables ; pas d'ontologie musicale imposée.

## ADR-003 — Import sérialisé et récupérable

1. Valider le lien et extraire un identifiant vidéo YouTube ; accepter uniquement les hôtes et formes d'URL prévus. Les playlists seules sont hors MVP.
2. Créer une tâche persistante, dédupliquée sur l'identifiant source. Un seul worker traite les tâches ; l'interface continue de répondre.
3. Lancer yt-dlp dans un sous-processus, avec arguments séparés, sans shell et sans configuration utilisateur implicite. Utiliser l'environnement Python verrouillé et un runtime Node explicitement configuré. Ne pas charger automatiquement des plugins locaux.
4. Extraire les métadonnées et télécharger dans le dossier temporaire de cette tâche. Désactiver le téléchargement de playlist. Limiter les reprises, la durée et les ressources ; fournir des erreurs lisibles pour vidéo indisponible, réseau, dépendance manquante ou stockage plein.
5. Convertir vers MP3 et normaliser la pochette. L'encodage ne recrée pas une qualité absente de la source.
6. Vérifier l'audio avec ffprobe ; publier les fichiers sur le même volume puis enregistrer la prod dans une transaction. Seules les prods prêtes sont visibles dans le catalogue.
7. Nettoyer les temporaires, arrêter les sous-processus au shutdown et marquer les tâches interrompues. Au redémarrage, réconcilier les fichiers déplacés mais non enregistrés et proposer une relance explicite ; aucun fichier partiel ne devient une prod prête.

Un second import du même identifiant retrouve la prod ou la tâche existante, y compris pour une autre forme d'URL. Les corrections manuelles ne sont pas écrasées.

Le téléchargement dépend des évolutions de YouTube. Prévoir un diagnostic de version et une procédure de mise à jour contrôlée de yt-dlp/EJS avec essai réel, sans mise à jour automatique invisible au lancement.

## API et lecture

Contrat à préciser dans l'implémentation ; ressources attendues : bibliothèque/diagnostic, tâches d'import, liste et fiche des prods, édition des métadonnées, fichier audio/pochette et action de localisation.

Le fichier audio est servi avec les requêtes HTTP Range pour permettre le déplacement dans la piste. Tester les statuts 200, 206 et 416, ainsi que l'absence du fichier. Un seul élément audio persistant dans l'interface évite la lecture simultanée de plusieurs cartes. Les fichiers et pochettes sont servis localement, sans dépendance à un embed YouTube.

L'action de localisation reçoit un identifiant de prod, jamais une commande ni un chemin libre. Le moteur résout le chemin validé et appelle Finder (`open -R`) ou l'Explorateur Windows pour sélectionner le fichier, en adaptant l'encodage et le passage des arguments à chaque système. Vérifier sur les OS réels, avec espaces et accents.

## Protection du moteur local

- Écoute sur boucle locale uniquement ; pas d'ouverture sur le réseau local.
- Valider Host et Origin, pas de CORS générique ; protection des actions de modification et de localisation par secret de session local et vérification d'origine.
- Résoudre et vérifier tous les chemins sous la bibliothèque, y compris les liens symboliques ; pas de lecture arbitraire de fichiers.
- Aucune exécution de commande provenant du titre, de la description ou d'un champ utilisateur.
- L'import n'accepte pas une URL arbitraire vers une ressource locale ou un autre service ; les liens marchands sont affichés, pas récupérés par le backend dans le MVP.
- Les descriptions sont du texte non fiable ; pas de HTML brut injecté. Liens externes HTTP(S) uniquement.
- Aucun fichier personnel, cookie navigateur, jeton ou chemin utilisateur complet dans les fixtures, logs publiés ou dépôt.

## Références vérifiées

Documentation primaire consultée le 24 octobre 2026 ; les compatibilités doivent être revérifiées lors du verrouillage des versions.

- [Vite : installation et prérequis Node](https://vite.dev/guide/)
- [FastAPI : réponses fichier](https://fastapi.tiangolo.com/advanced/custom-response/)
- [Starlette : FileResponse et HTTP Range](https://www.starlette.dev/responses/)
- [SQLite : usages locaux et format transportable](https://www.sqlite.org/whentouse.html)
- [SQLite : journaux WAL](https://www.sqlite.org/wal.html)
- [SQLite : garanties et limites des commits](https://www.sqlite.org/atomiccommit.html)
- [yt-dlp : dépendances, métadonnées et post-traitement](https://github.com/yt-dlp/yt-dlp)
- [yt-dlp : runtime JavaScript et composants EJS](https://github.com/yt-dlp/yt-dlp/wiki/ejs)
