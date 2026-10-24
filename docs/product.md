# Cadrage produit

Date de référence : 24 octobre 2026.

## Problème

Les playlists YouTube rendent la sélection d'une prod trop lente au début d'une session de musique. L'utilisateur reconnaît les pochettes, mais veut aussi rechercher un style et une ambiance, par exemple « R&B mélancolique ». Il utilise un Mac et un Windows et souhaite transporter sa bibliothèque sur un disque externe.

## Objectif du MVP

Terminer ce parcours réel : lien YouTube → MP3 et pochette stockés localement → recherche → écoute dans l'interface → fichier sélectionné dans Finder ou l'Explorateur Windows.

Le même dossier de bibliothèque doit conserver ses fichiers et son catalogue lorsqu'il change d'emplacement ou d'ordinateur. Les imports nécessitent Internet ; la consultation, la recherche et l'écoute des fichiers déjà importés doivent fonctionner hors ligne lorsque le moteur local tourne.

## Besoins confirmés

- Interface web servie par un moteur local, accepté par l'utilisateur.
- Grille de grandes pochettes, cartes arrondies, surfaces de verre translucide, animations discrètes.
- Écoute intégrée obligatoire.
- Recherche par titre, beatmaker, style et ambiance.
- BPM, tonalité, favoris, date de publication YouTube et date d'ajout à la bibliothèque.
- Bouton pour localiser le MP3 dans le gestionnaire de fichiers.
- Bibliothèque transportable entre Mac et Windows.
- Développement par étapes, avec issues GitHub et critères de validation.

## Choix de périmètre proposés

Ces choix réduisent la première livraison ; ils ne sont pas présentés comme des demandes explicites de l'utilisateur.

| Fonction | MVP | Comportement attendu |
| --- | --- | --- |
| Import YouTube | Oui | Une vidéo publique à la fois, URL courte ou classique ; un lien vidéo contenant un paramètre de playlist importe seulement la vidéo |
| Progression | Oui | État d'attente, extraction, téléchargement, conversion, succès ou erreur ; pas de pourcentage inventé |
| Audio local | Oui | MP3 et pochette sauvegardés, écoute indépendante de YouTube après import |
| Lecteur | Oui | Lecture/pause, déplacement dans la piste, volume ; une seule piste active ; reste actif pendant les filtres |
| Catalogue | Oui | Grille paginée, états vide/chargement/erreur, pochette de remplacement |
| Métadonnées | Oui | Titre et chaîne récupérés ; beatmaker, styles, ambiances, BPM et tonalité modifiables |
| Recherche | Oui | Texte sans distinction de casse ni d'accents ; filtres combinables style/ambiance/beatmaker/favori ; tri par ajout ou publication |
| Publication | Oui | Date YouTube quand disponible, précision à la journée ; jamais remplacée par la date d'import |
| Lien d'achat | Oui, limité | Extraire les liens candidats de la description, permettre correction ; affichage comme lien externe |
| Playlists complètes | Après MVP | Import par lot avec progression et échecs par vidéo |
| Analyse de pages marchandes | Après MVP | Adaptateurs par marketplace ; aucun extracteur universel promis |
| MP3 déposés dans audio | Première tranche avancée (#15) | Demande utilisateur : indexer sans déplacer les originaux, afficher une carte et écouter ; l'import de fichiers depuis un autre dossier reste pour plus tard |
| Historique des morceaux | Après MVP | Associer une prod à un morceau et à une date d'utilisation |
| Analyse audio par IA | Après MVP | Proposer des styles et ambiances à partir du son |

## Métadonnées honnêtes

La chaîne YouTube est une source, pas nécessairement le beatmaker. Conserver ces deux champs séparément. Un éventuel beatmaker proposé depuis le titre doit rester modifiable.

Lire uniquement les motifs explicites du titre ou de la description pour proposer BPM et tonalité. Conserver la provenance des valeurs extraites. Laisser vide si ambigu ; ne pas déduire un BPM de n'importe quel nombre ni inventer un style. Les corrections manuelles priment sur une nouvelle extraction.

Un favori, des tags et les corrections doivent survivre à un redémarrage, au rebranchement du disque et au transfert entre machines.

## Interface

Écran principal : nom de bibliothèque, recherche, action « Importer », filtres compacts et grille de pochettes. Chaque carte montre pochette, titre, beatmaker si connu, favori et action de lecture. Les espaces réservés au titre, au beatmaker et aux actions restent constants ; les titres longs défilent sur une seule ligne au survol ou au focus clavier (#21), avec respect de la réduction des animations et accès au texte complet sans mouvement. Les métadonnées détaillées apparaissent dans une pop-up centrée (#20), avec défilement interne et fermeture toujours accessible. La page arrière reste immobile pendant sa consultation.

Lecteur persistant en bas : pochette réduite, titre, lecture/pause, progression et volume. Changer de recherche ne coupe pas la piste. Sélectionner une autre prod remplace la piste active. Prévoir navigation clavier, focus visible, libellés accessibles et contraste lisible malgré la transparence.

Import : champ URL, validation, état explicite, erreur récupérable et lien vers la prod lorsqu'elle est prête. Un doublon mène à la prod existante. Une URL de playlist seule explique que l'import par lot viendra ensuite.

## Validation de l'expérience

Le MVP est terminé lorsque le parcours complet est démontré avec une vraie vidéo choisie pour la recette, que l'écoute fonctionne hors ligne après import et qu'un transfert Mac/Windows conserve les fichiers et les annotations. La recette Windows réelle reste nécessaire même si les tests automatisés passent sur Windows.

Cette phase de cadrage ne fixe ni date de livraison ni qualité d'extraction garantie pour toutes les vidéos.
