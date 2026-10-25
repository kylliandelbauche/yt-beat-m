# Architecture proposée

Statut : socle moteur/interface (#1), catalogue portable (#2), import YouTube (#3), grille et fiche détaillée (#4), cartes et lecteur de MP3 locaux (#15) disponibles. L’édition locale et les filtres musicaux avancés sont disponibles (#6).

## Composants

| Composant | Choix proposé | Raison |
| --- | --- | --- |
| Interface | React, TypeScript, Vite, CSS avec variables de design | Grille et lecteur interactifs, typage et styles maîtrisés sans imposer un serveur de rendu |
| Moteur local | Python 3.13, FastAPI, Pydantic, uv | API typée, accès aux fichiers et proximité avec l'écosystème yt-dlp |
| Catalogue | SQLite via sqlite3, migrations SQL versionnées | Un catalogue local transportable, sans service de base de données séparé |
| Import | yt-dlp avec dépendances `default`, FFmpeg/ffprobe | Extraction de métadonnées, récupération audio et conversion MP3 |
| Runtime JavaScript | Node.js 24 LTS | Utilisé pour le frontend et explicitement configuré pour les challenges YouTube de yt-dlp |
| Vérification | pytest, Ruff, TypeScript/Oxlint et Playwright | Tester les opérations sur fichiers, les erreurs d'import, l'audio et les parcours utilisateur |

Les versions sont verrouillées dans `uv.lock` et `frontend/package-lock.json`. Le template Vite retenu utilise Oxlint, conservé à la place d'ESLint pour éviter une seconde configuration de lint. Pas de dépendances à `latest` lors d'une exécution normale. Playwright vérifie les parcours métier sur Chromium, avec une bibliothèque temporaire et un téléchargement simulé, sur Mac et Windows en CI.

## ADR-001 — Navigateur et moteur local

Décision proposée : un processus local sert l'API et le frontend compilé sur la même origine, lié à `127.0.0.1`. En développement, Vite relaie `/api` au moteur local. Le navigateur affiche l'interface ; le moteur télécharge, stocke et localise les fichiers.

L'application s'installe sur chaque machine, le dossier de données voyage. Les lanceurs Mac et Windows ouvrent le navigateur et affichent les diagnostics de dépendances. Les premières versions peuvent demander une installation documentée de Python/uv, Node et FFmpeg. Un exécutable autonome tout inclus ne fait pas partie du MVP.

Ce choix évite un hébergement distant pour les fichiers personnels. Il demande néanmoins un moteur en fonctionnement pendant l'utilisation et une installation sur chaque poste. La future distribution pourra être réévaluée sans changer le format de la bibliothèque.

## ADR-002 — Bibliothèque transportable

```text
MaBibliotheque/
  library.json                 # identifiant et version du format
  catalog.sqlite3              # catalogue, tags, favoris, tâches
  audio/<uuid>/<Beatmaker - Titre - BPM - Tonalité>.mp3
  artwork/<uuid>.jpg
  staging/<job-uuid>/           # fichiers temporaires non publiés
  backups/                     # sauvegardes avant migration
```

Tous les chemins persistés dans le catalogue sont relatifs, utilisent `/` et ne contiennent ni lettre de lecteur Windows ni point de montage Mac. Ils sont résolus sous la racine configurée. Les nouveaux imports (#43) utilisent un nom lisible dans un sous-dossier UUID, avec nettoyage et longueur bornée pour Mac/Windows. Le dossier empêche les collisions entre noms identiques ; le titre affiché reste indépendant du nom physique. Les anciens chemins `audio/<uuid>.mp3` restent valides sans migration ni renommage.

Exception pour les MP3 déposés manuellement (#15) : l'indexage explicite conserve le nom et l'emplacement de l'original dans `audio`, avec un chemin relatif et une identité UUID au catalogue. Il ne réécrit pas le fichier. La durée et le titre ID3 sont lus avec Mutagen ; le nom du fichier sert de titre de repli. Les pochettes JPEG/PNG intégrées sont extraites dans `artwork` sous un nom UUID. Les chemins sortants et liens symboliques sont refusés. Les tests utilisent un son synthétique, jamais les fichiers personnels.

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

## ADR-004 — Identité du producteur (#22)

La migration 2 ajoute l'identifiant YouTube stable de chaîne et une table de règles de noms dans le catalogue portable. Les nouvelles vidéos conservent cet identifiant ; pour les imports anciens qui ne le possèdent pas, une règle peut être attachée au nom de chaîne normalisé, avec cette limite indiquée dans la fiche. Une règle par nom déjà mémorisée reste un repli pour un nouvel import si aucune règle par identifiant ne s'applique ; elle peut donc aussi correspondre à une chaîne homonyme, ce qui est signalé. Une règle par identifiant est prioritaire. Aucun accès web automatique n'est ajouté.

Un crédit explicite cohérent propose le beatmaker ; sinon la chaîne sert de proposition identifiée comme telle. Des crédits contradictoires restent à préciser. Une collaboration explicite est conservée comme crédit collectif, sans créer ni fusionner arbitrairement des personnes.

Une correction par prod est prioritaire, y compris un champ volontairement vidé. Une règle mémorisée s'applique aux prochains imports sans crédit différent, ou dont le crédit correspond au nom corrigé ; elle ne masque pas une nouvelle collaboration ou un autre producteur explicitement crédité. La règle peut être retirée et la correction d'une prod peut revenir à la proposition automatique. L'actualisation des anciennes prods est une action explicite, locale et transactionnelle, qui conserve les corrections, les autres annotations et les médias.

## ADR-005 — Corrections et recherche locale (#6)

La fiche permet de corriger BPM, tonalité, styles, ambiances et liens d’achat. Le crayon de la fiche ouvre une édition unifiée (#33), y compris le titre et la description ; le beatmaker conserve les règles de proposition de #22. `PATCH /api/beats/{id}/metadata` modifie uniquement les champs transmis ; `null` vide le BPM ou la tonalité, `[]` vide les tags ou les liens. Les modifications sont validées avant une transaction unique et protégées par la session locale. Aucun lien marchand n’est récupéré par ce parcours.

Le schéma 2 possède déjà les tables nécessaires : aucune migration ni modification des médias. `field_provenance` marque chaque champ corrigé `manual`, y compris une valeur vide, et garde la première valeur remplacée et sa provenance sous `original_metadata`. Les dates restent inchangées ; une description corrigée conserve son texte d’origine dans la provenance. Les propositions de beatmaker continuent à consulter ce texte source. Les futurs enrichissements doivent ignorer ces champs marqués manuels ; les doublons d’import et l’actualisation des beatmakers les préservent déjà. Les liens corrigés portent également `manually_edited=1` et `provenance=manual`.

Les tags libres sont dédupliqués par catégorie sans casse, accents ni espaces superflus ; le premier libellé lisible est conservé. Les tonalités avec note et mode sont normalisées (Cmin, C minor et Do mineur correspondent). Les orthographes enharmoniques restent distinctes et aucune tonalité sans mode n’est inventée. Cette normalisation ne change pas l’extraction des descriptions, traitée séparément dans #27.

`GET /api/catalog/filters` expose les valeurs utilisées dans toute la bibliothèque. La liste accepte des paramètres répétés `keys`, `makers`, `channels`, `styles`, `moods` : OU dans une catégorie, ET entre catégories, favoris et termes textuels. `bpm_min` / `bpm_max` sont inclusifs (0 exclu à 1000 inclus, bornes identiques pour une valeur exacte). Les options `*_missing` sélectionnent explicitement les données absentes et peuvent être combinées aux valeurs connues dans la même catégorie. Une plage inversée renvoie une erreur lisible. Les tris `added_desc`, `added_asc`, `published_desc`, `published_asc` utilisent l’identifiant comme départage stable et placent toujours les publications inconnues en dernier.

L’interface recharge la première page après changement de filtre et ignore les anciennes réponses de pagination. Le lecteur conserve son identité, son état lecture/pause et sa position pendant recherche et édition ; il ne dépend pas des cartes actuellement visibles.

## Intégration Officiel (#33)

Le composant Modal partage les garanties de fermeture, verrouillage de page et retour du focus entre fiche, Bibliothèque et Diagnostic. La fiche intercepte la fermeture en cas de brouillon modifié. L’édition utilise un seul PATCH transactionnel : annotations, titre/description et correction ou règle de beatmaker sont validés ensemble. Les contrôles de suppression de règle et de retour à la proposition sont préparés dans le brouillon puis appliqués par Save. Les anciens endpoints beatmaker restent disponibles, avec la même logique réutilisée dans la transaction unifiée. La chaîne, les dates et la durée ne sont pas éditables via ce PATCH.

`POST /api/library/refresh`, protégé par session locale, enchaîne l’indexage MP3 puis le recalcul des beatmakers et retourne leurs résultats et le résumé de bibliothèque. Les opérations déjà réussies restent persistées si le stockage devient indisponible entre les étapes ; une relance est sûre, l’indexage étant dédupliqué et les corrections préservées.

La liste expose BPM et tonalité pour les cartes horizontales. La disposition est une préférence de ce navigateur (`beat-m-layout`), sans chemin ni donnée musicale dans le stockage navigateur ; aucune migration du catalogue. L’import montre les tâches actives, erreurs récupérables et la dernière tâche explicitement importée, sans dépliant d’historique. Le taux du téléchargement n’est pas transformé en estimation globale : une conversion reste indéterminée, 100 % est réservé à l’état completed.

La confirmation de sauvegarde remplace temporairement l’icône du bouton existant par une coche ; une zone d’annonce accessible hors du flux donne le résultat. Les erreurs et la demande d’abandon occupent une surface superposée dans la fiche, avec actions accessibles. Aucun de ces états ne crée de ligne supplémentaire entre l’en-tête et les colonnes (#37).

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

Ressources disponibles : bibliothèque/diagnostic, tâches d'import, liste et fiche des prods, favori persistant et fichiers audio/pochette. La liste est paginée après filtrage et combine recherche textuelle normalisée (titre, beatmaker, chaîne, tags), favoris et catégories musicales. La localisation du MP3 est disponible depuis la fiche (#7, #41).

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

## Sélecteur natif de dossier (#35)

`POST /api/library/pick-folder` est protégé par origine et jeton de session et n’accepte ni commande ni script fourni par le navigateur. Le moteur lance un script fixe avec arguments séparés (`osascript` et dialogue macOS ; PowerShell en STA et FolderBrowserDialog sur Windows), sans `shell=True` ni interpolation d’entrée utilisateur. Le choix retourne un chemin ou null à l’annulation, sans ouvrir ni créer une bibliothèque. Le gestionnaire existant valide ensuite l’ouverture/création explicite.

Une seule fenêtre native peut être ouverte par moteur ; le sélecteur ne détient pas le verrou de bibliothèque, afin de laisser les lectures et imports répondre. Le délai de cinq minutes et les erreurs natives rendent un message récupérable et libèrent le verrou du sélecteur. Les OS non pris en charge ou moteurs sans session graphique conservent la saisie manuelle. Le chemin choisi reste local à l’interface et aux préférences machine ; aucun changement du catalogue portable.

## Import et fiche épurés (#39)

Le frontend suit les tâches actives toutes les 250 ms et actualise le catalogue avant de demander l’ouverture unique d’une nouvelle réussite. Les tâches déjà terminées au premier relevé servent de référence historique et ne rouvrent pas leur fiche. Les tâches actives au chargement restent suivies. Une fiche déjà ouverte retarde les ouvertures automatiques suivantes dans une file locale, évitant la destruction d’un brouillon. Les doublons prêts ouvrent la fiche existante directement.

La barre est rendue en CSS et ARIA, sans composant progress natif : couleur menthe et largeur contrôlée par les mesures ; animation distincte pour les étapes non mesurables, respect de la réduction des animations. Le signal yt-dlp est sollicité au plus toutes les 0,2 s. Un test du vrai processus yt-dlp sur un serveur HTTP local contrôlé valide plusieurs pourcentages intermédiaires, sans contacter YouTube ni importer de média personnel.

La fiche ne prépare plus de corrections de tags/règles/provenance. Elle envoie uniquement les champs visibles modifiés et remplace le premier lien si son URL change ; les liens secondaires et annotations sont préservés par le PATCH partiel existant. Aucune migration. Les anciennes fonctions avancées restent disponibles dans le moteur, sans contrôles dans cette fiche.


## Lecture et localisation depuis les pochettes (#41, #7)

Les boutons Play/Pause des deux dispositions et de la fiche utilisent le même élément audio persistant. Les événements natifs play, pause, ended et error déterminent l’icône, y compris avec les contrôles du lecteur. Une pause/reprise sur la même prod ne recrée pas l’audio ; un changement de prod remplace sa source. Les événements et rejets tardifs d’un ancien élément sont ignorés. Les recherches, changements de disposition et fiches ne touchent pas à la position de lecture. Les boutons gardent leurs dimensions.

La zone de progression conserve 24 px, au repos comme pendant l’import ; la marge avant la bibliothèque passe à 16 px sur ordinateur et petite fenêtre.

`POST /api/beats/{UUID}/reveal` exige l’origine locale et le jeton de session. Le moteur résout le chemin relatif enregistré avec `media_path`/`safe_path`, vérifie le fichier et bloque les sorties de bibliothèque et liens symboliques. Aucun chemin fourni par le navigateur n’est utilisé. Le verrou de sélection de bibliothèque reste détenu pendant la résolution et l’appel natif. Fichier absent, disque déconnecté et erreur système donnent un message récupérable sans déplacer la fiche. Aucune migration.

macOS utilise `/usr/bin/open -R` avec arguments séparés et délai de dix secondes. Windows appelle les API Unicode `SHParseDisplayName` puis `SHOpenFolderAndSelectItems` avec un item et cidl=0 : l’Explorateur ouvre le dossier parent et sélectionne le MP3. COM est initialisé dans le thread de requête puis libéré, ainsi que la mémoire de l’item, même en erreur. Cette voie évite les ambiguïtés de guillemets et virgules d’une ligne de commande Explorer ; aucune exécution shell. Référence : [Microsoft — SHOpenFolderAndSelectItems](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems). La recette Windows avec interface graphique et disque physique reste dans #8.


## Nommage lisible à la publication (#43)

Le worker calcule le beatmaker et le nom final dans la même transaction que la publication, après vérification du MP3 ; une règle mémorisée concurrente ne peut pas désynchroniser le nom et le catalogue. `audio_filename` produit quatre champs séparés par « - », puis `.mp3`. La normalisation NFC conserve les accents ; les caractères interdits Windows et contrôles sont nettoyés, les noms réservés neutralisés et chaque champ borné. La taille totale reste sous 180 octets même en Unicode décomposé, sans tronquer la fin musicale au profit d’un long titre. Le chemin complet dépend toujours de la racine choisie et des limites du système de fichiers.

La publication conserve un chemin relatif dans le schéma 2 existant. Le dossier UUID est créé exclusivement, après contrôle de tous les fichiers cibles et avant le marqueur de publication ; un emplacement préexistant n’est jamais revendiqué. Le marqueur est écrit avant les déplacements pour permettre la reprise en cas d’arrêt. Le nettoyage accepte les anciens fichiers UUID et le nouveau nom uniquement sous le dossier de cette tâche ; empreinte SHA-256 et absence de référence au catalogue restent obligatoires. Un fichier remplacé, étranger ou référencé est conservé. Seuls les dossiers devenus vides sont retirés. Le scan de MP3 manuels reste limité au premier niveau de `audio` ; les fichiers importés dans les sous-dossiers sont déjà catalogués par le worker.

Pas de renommage des fichiers existants ou après édition des métadonnées. Lecture Range et localisation résolvent le chemin relatif enregistré, sans dépendre de son nom ni de la racine du disque. Référence des contraintes : [Microsoft — Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).
