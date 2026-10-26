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

La chaîne YouTube est une source, pas nécessairement le beatmaker. Conserver ces deux champs séparément. Un crédit explicite cohérent du titre ou de la description propose le beatmaker ; à défaut, la chaîne fournit une proposition identifiée comme telle. Le nom reste modifiable. Les règles de nom mémorisées par chaîne ne masquent pas les crédits différents ni les collaborations explicites (#22).

Lire uniquement les motifs explicites du titre ou de la description pour proposer BPM et tonalité. Conserver la provenance des valeurs extraites. Laisser vide si ambigu ; ne pas déduire un BPM de n'importe quel nombre ni inventer un style. Les corrections manuelles priment sur une nouvelle extraction.

Un favori, des tags et les corrections doivent survivre à un redémarrage, au rebranchement du disque et au transfert entre machines.

## Interface

Écran principal : nom de bibliothèque, recherche, action « Importer », filtres compacts et grille de pochettes. Chaque carte montre pochette, titre, beatmaker si connu, favori et action de lecture. Les espaces réservés au titre, au beatmaker et aux actions restent constants ; les titres longs défilent sur une seule ligne au survol ou au focus clavier (#21), avec respect de la réduction des animations et accès au texte complet sans mouvement. Les métadonnées détaillées apparaissent dans une pop-up centrée (#20), avec défilement interne et fermeture toujours accessible. La page arrière reste immobile pendant sa consultation ; un clic à l’extérieur ferme la pop-up, avec protection contre les glissers accidentels.

Règle générale de stabilité : un changement d’état conserve l’emplacement et les dimensions des éléments. Les confirmations, erreurs et avertissements utilisent un emplacement réservé ou une présentation hors du flux. Dans la fiche, une sauvegarde réussie affiche brièvement une coche dans le même bouton de 36 × 36 px ; elle ne rajoute aucun texte dans les colonnes. Les messages restent accessibles sans déplacement du focus ni interruption audio.

Lecteur persistant en bas : pochette réduite, titre, lecture/pause, progression et volume. Cliquer sur la pochette ou le titre ouvre la fiche de la prod active, même si elle est masquée par les filtres ; le raccourci est accessible au clavier et conserve la lecture et sa position (#45). Changer de recherche ne coupe pas la piste. Sélectionner une autre prod remplace la piste active. Prévoir navigation clavier, focus visible, libellés accessibles et contraste lisible malgré la transparence.

Import : champ URL, validation, état explicite, erreur récupérable et lien vers la prod lorsqu'elle est prête. Un doublon mène à la prod existante. Une URL de playlist seule explique que l'import par lot viendra ensuite.

## Validation de l'expérience

Le MVP est terminé lorsque le parcours complet est démontré avec une vraie vidéo choisie pour la recette, que l'écoute fonctionne hors ligne après import et qu'un transfert Mac/Windows conserve les fichiers et les annotations. La recette Windows réelle reste nécessaire même si les tests automatisés passent sur Windows.

Cette phase de cadrage ne fixe ni date de livraison ni qualité d'extraction garantie pour toutes les vidéos.

## Édition et filtres livrés (#6)

Dans la fiche, l’icône crayon permet de renseigner ou vider BPM, tonalité, styles, ambiances et liens d’achat. Les corrections restent locales et prioritaires ; les valeurs d’origine sont consultables séparément. Les tags se saisissent avec des virgules. Une page marchande peut être ouverte pour recopier ses informations ; son analyse automatique reste dans #10.

La grille combine BPM, tonalité, beatmaker, chaîne, style, ambiance, favoris et recherche textuelle. Les filtres musicaux proposent les données non renseignées ; les sélections actives se retirent individuellement ou ensemble. Les tris distinguent ajout et publication YouTube. L’écoute continue pendant ces opérations.

## Référence Officiel intégrée (#33)

La ligne « Officiel » de Paper est la référence approuvée ; les deux dispositions (grandes pochettes et cartes horizontales 384 × 128 px) coexistent. Les futures propositions vont dans « À valider » et les révisions remplacées dans « Historique » après accord. Les filtres Style et Ambiance restent directement actifs, conformément à la clarification utilisateur ; aucun « bientôt » ne masque une fonction déjà livrée.

L’import affiche directement son suivi, sans historique dépliant. Seul le téléchargement fournit un pourcentage mesuré ; les autres étapes restent indéterminées et 100 % signifie que la prod est prête. Une erreur conserve sa relance accessible.

La fiche de référence 900 × 652 px comporte deux colonnes et une description de 280 px qui défile indépendamment. Le crayon devient Save menthe dans le même emplacement 36 × 36 px ; Annuler rétablit les données enregistrées, une fermeture avec modifications demande explicitement de les abandonner. Titre, description, beatmaker, BPM, tonalité, tags, liens et règles de nom sont enregistrés ensemble ou refusés ensemble. Les dates, la chaîne source et la durée restent distinctes et consultables. Sur petite fenêtre, le contenu s’adapte et défile avec les actions toujours accessibles.

Actualiser combine indexage et recalcul des beatmakers, sans écraser les corrections. Bibliothèque et Diagnostic sont des fenêtres centrées. La pochette du lecteur suit la prod active ; sa lecture et sa position ne dépendent ni de la disposition ni des filtres.

## Choix natif du dossier (#35)

Dans Bibliothèque, « Ouvrir un dossier » ouvre le sélecteur natif Mac/Windows. Le dossier choisi remplit le formulaire ; « Ouvrir la bibliothèque » valide ensuite le dossier contenant library.json. En mode création, « Choisir un dossier » permet de sélectionner un dossier vide avant création explicite. Annuler ne change ni le chemin ni la bibliothèque ouverte. La saisie manuelle reste disponible si le sélecteur ne peut pas s’ouvrir.

## Import et fiche épurés (#39)

Une nouvelle prod prête ouvre automatiquement sa fiche une seule fois ; les anciennes réussites au chargement ne rouvrent rien. Si une autre fiche est ouverte, la nouvelle attend sa fermeture pour préserver un éventuel brouillon. Le bouton « Voir la prod » et les confirmations de mise en file sont supprimés.

Une zone réservée sous le champ URL contient une barre menthe personnalisée. Son remplissage suit les pourcentages réels du téléchargement ; lecture des informations, conversion et vérification sont distinctes et indéterminées lorsqu’aucun taux fiable n’existe. Aucun taux global fictif. Une erreur conserve sa relance.

À la demande de l’utilisateur, la fiche ne montre plus Annotations et origine, styles/ambiances, règles de chaîne et textes annexes. Le lien principal de vente se corrige directement dans un champ de 42 px à la place du bouton, selon Paper. Les tags, la provenance, les règles et les liens secondaires déjà enregistrés restent au catalogue ; la sauvegarde des champs visibles ne les efface pas. Les filtres Style/Ambiance de la grille restent actifs. Ces choix remplacent les anciens contrôles décrits dans les livraisons #6/#33.


## Noms des MP3 importés (#43, #47)

Les prochains téléchargements produisent un fichier nommé `Beatmaker_Titre_130BPM_F#-minor.mp3`, avec les métadonnées disponibles au moment de l’import. Le beatmaker suit les crédits et règles mémorisées du catalogue. Les valeurs absentes deviennent « Beatmaker-inconnu », « BPM-inconnu » ou « Tonalité-inconnue ». Les blocs sont séparés par des underscores `_` ; tous leurs espaces deviennent des tirets `-` et le nombre est collé à BPM. Aucun espace dans le nom final. Les caractères incompatibles sont nettoyés et les noms très longs raccourcis par champ, en conservant les quatre emplacements.

Le nom du fichier reste lisible, sans identifiant ajouté ; un sous-dossier propre à l’import évite les collisions entre deux prods au même nom. Les fichiers déjà présents et les MP3 déposés manuellement gardent leur nom. Une correction ultérieure dans la fiche ne renomme pas le fichier dans cette tranche.


## Finition de la bibliothèque (#49)

La finition inspirée d’Impeccable conserve la direction Paper. Les cartes restent visibles pendant la mise à jour des filtres, avec un état de recherche annoncé, pour conserver le défilement. Les filtres réservent la même place au chevron et au compteur actif ; la recherche devient pleine largeur sur petite fenêtre et les contrôles principaux ont des cibles de 44 px. Le bouton d’import reste menthe et lisible dans ses états interactifs. Les icônes SVG partagées et les couleurs sémantiques renforcent la cohérence, avec lecture et focus préservés. Le bilan et les captures comparables sont dans [la revue UI/UX](design-review-49.md).


## Typographie UI UX Pro Max (#51)

Le duo Poppins/Open Sans issu du profil Modern Professional du skill UI UX Pro Max renforce la séparation entre titres et texte de travail. Les polices sont incluses localement avec leurs licences pour conserver l’usage hors ligne. Le système conserve la palette Paper, les conteneurs fixes et la lecture ; le titre de fiche utilise le même style en lecture et en édition. Un chargement lent garde le repli système pour cette navigation. Les choix et vérifications sont détaillés dans [la revue typographique](design-review-51.md).

## Titres sur une ligne dans toutes les vues (#53)

Les titres restent sur une ligne dans les grandes pochettes, les cartes horizontales, le lecteur et la fiche. La référence Paper du 26/10 fournit les espacements et l’emplacement de titre de fiche de 52 px, identique en lecture et édition ; le champ d’édition est un texte sur une ligne. Les titres longs restent complets dans les données et accessibles : fondu à droite, défilement au survol ou au focus sans déplacement des autres éléments, désactivé en mouvement réduit. Les colonnes et actions de la fiche gardent leur géométrie pendant l’édition et la sauvegarde. Voir [les mesures Paper](design/53-paper-titles.md).

## Stabilité des champs et des textes (#55)

La fiche conserve les mêmes champs natifs en consultation readonly et en édition. Leurs polices, interlignes, paddings et bordures réservées sont communs ; titre, valeurs, libellés et lignes de description gardent leur cadrage. Le titre conserve son défilement horizontal, la description son scroll vertical ; le passage de mode ne prend pas le focus. Libellé et URL de vente restent aux mêmes emplacements. L’erreur de sauvegarde est superposée dans l’en-tête, avec brouillon conservé et relance ; les erreurs de saisie sont expliquées et associées aux champs. Les mesures et limites sont décrites dans [la vérification de fiche](design/55-stable-fields.md).
