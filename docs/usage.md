# Utiliser Beat m

L'[installation et les commandes de vérification](../README.md) sont dans le README.

## Lancement

`uv run yt-beat-m serve` lance le moteur sur `127.0.0.1:8765` et ouvre le navigateur. Le terminal reste ouvert ; `Ctrl+C` arrête le moteur et libère la bibliothèque.

- `uv run yt-beat-m doctor` vérifie les dépendances, sans téléchargement.
- `uv run yt-beat-m serve --no-browser` évite l'ouverture du navigateur.
- `uv run yt-beat-m serve --port 8766` utilise un autre port.

Pour développer, lancer dans deux terminaux `uv run yt-beat-m serve --dev --no-browser` et `npm --prefix frontend run dev`, puis ouvrir `http://127.0.0.1:5173`.

## Bibliothèque

Dans **Réglages → Bibliothèque**, **Ouvrir un dossier** affiche le sélecteur natif. Valider ensuite avec **Ouvrir la bibliothèque**. Pour une nouvelle collection, choisir le mode création et un dossier vide ; un dossier non vide n'est pas écrasé. Annuler le sélecteur ne change pas la bibliothèque. La saisie manuelle d'un chemin reste disponible.

Le dossier contient `library.json`, `catalog.sqlite3`, `audio`, `artwork`, `staging` et `backups`. Les chemins du catalogue sont relatifs. La préférence de sélection est propre à la machine, dans le dossier de configuration utilisateur `yt-beat-m/preferences.json` déterminé par platformdirs.

La dernière bibliothèque est rouverte si elle est accessible. Un disque absent produit une erreur, sans créer de catalogue vide. La présence du fichier `.library.lock` après fermeture est normale : le verrou dépend du processus actif.

Une sauvegarde du catalogue précède les migrations. Arrêter le moteur avant de déplacer la bibliothèque ou d'éjecter son disque ; copier tout le dossier, pas seulement les MP3. Les partages réseau, liens symboliques internes et accès simultanés ne sont pas pris en charge. La recette sur disque physique et sur Windows reste à confirmer.

## Imports et MP3 locaux

Une URL YouTube courte ou classique importe une vidéo publique. Un lien vidéo contenant une playlist n'importe que cette vidéo. Durée maximale : 30 minutes ; limite de récupération configurée à 100 Mo et délai de téléchargement de dix minutes. Vidéos privées, directs en cours et cookies ne sont pas pris en charge.

L'import passe par attente, extraction, téléchargement, conversion et vérification. Seul le téléchargement fournit un pourcentage mesuré ; les autres étapes sont indéterminées. La fiche s'ouvre lorsque la prod est prête. Les doublons mènent à la prod existante. Après erreur ou interruption, utiliser **Réessayer**. Le moteur conserve les fichiers prêts et nettoie les fichiers temporaires dont il peut établir la propriété.

Les nouveaux fichiers sont nommés avec beatmaker, titre, BPM et tonalité, dans un sous-dossier unique. Les caractères incompatibles sont nettoyés et les espaces remplacés ; les anciens MP3 ne sont pas renommés.

Pour indexer un MP3 existant, le déposer directement dans `audio`, puis utiliser **Actualiser**. Les sous-dossiers ne sont pas parcourus. Le titre vient du tag ID3 ou du nom du fichier ; une pochette JPEG/PNG intégrée est récupérée si disponible. Les originaux ne sont pas réécrits. Les changements de tags d'un fichier déjà indexé ne sont pas resynchronisés.

Si YouTube change, mettre à jour yt-dlp/EJS dans une branche : `uv lock --upgrade-package yt-dlp --upgrade-package yt-dlp-ejs`, puis `uv sync --locked`. Vérifier les contrôles et un import réel avant fusion. Pas de mise à jour automatique au lancement.

## Recherche, fiche et lecture

Recherche par titre, beatmaker, chaîne ou tags, sans distinction de casse ni d'accents. Les filtres BPM, tonalités, tags, beatmakers, chaîne et favoris se combinent ; les tris distinguent ajout et publication. La galerie charge les prods par pages. Les deux dispositions restent disponibles, avec des titres sur une ligne.

La fiche latérale réserve sa place. Le crayon active l'édition ; **Enregistrer** valide les champs ensemble, **Annuler** rétablit les valeurs enregistrées. Quitter avec un brouillon demande confirmation. Les corrections manuelles priment sur les propositions automatiques. Les tonalités sont normalisées en notation anglaise. Les informations absentes ne sont pas inventées.

Le **+** des tags ouvre leur sélection et modifie le brouillon. Fermer ce menu conserve les choix jusqu'à Enregistrer ; Annuler ne crée pas de tag. **Réglages → Tags** permet de renommer ou supprimer un tag pour toute la collection, avec confirmation. Cela ne supprime aucune prod ni média.

Un seul lecteur assure lecture/pause, déplacement, volume et mode muet. Recherche, filtres, profils et fiches conservent la piste et sa position. Cliquer sur le titre ou la pochette du lecteur ouvre sa fiche. **Afficher dans le dossier** sélectionne le fichier local pour le glisser dans son logiciel de musique. L'écoute hors ligne nécessite le moteur en fonctionnement.

## Beatmakers

Les profils sont des entités distinctes ; une collaboration peut associer plusieurs profils à une prod. Nom, photo JPEG/PNG, réseaux et sites de vente sont modifiables. Le profil donne accès à ses prods et aux chaînes YouTube correspondantes lorsqu'elles sont connues.

Les portraits sont récupérés en arrière-plan depuis la chaîne identifiée ; une photo manuelle reste prioritaire. Les identités ambiguës demandent une correction. La chaîne YouTube et le crédit source restent séparés du profil.

**Fusionner** réunit un doublon après aperçu. **Supprimer** retire un profil et ses associations sans effacer ses prods ou MP3. Les anciens noms deviennent des alias et les profils supprimés ne sont pas recréés automatiquement. Les associations manuelles sont conservées par Actualiser.

## Données et suivi

Le catalogue, les photos et les relations voyagent avec la bibliothèque. Les imports et portraits contactent YouTube ; la consultation des médias déjà importés reste locale. Aucun compte, service cloud ni clé API n'est nécessaire.

Les décisions détaillées sont dans [le cadrage](product.md), [l'architecture](architecture.md) et [le suivi de livraison](delivery.md). Le [kanban](https://github.com/users/kylliandelbauche/projects/2) et le suivi agrégé décrit dans [AGENTS.md](../AGENTS.md) accompagnent chaque issue. Les rapports bruts et données personnelles restent exclus de Git.
