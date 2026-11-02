# Cadrage produit

Date de référence : 24 octobre 2026.

## Priorité actualisée — 29 octobre 2026

L'utilisateur reporte Windows et donne la priorité à une validation essentielle sur Mac, puis aux pages Beatmakers (#62) et Mes sons (#11), développées une à une à partir de Paper. La recette Windows et le lancement à double-clic sont différés et ne bloquent plus ces fonctionnalités. Le lancement documenté existant reste utilisable. Les chemins relatifs et les garanties de conservation des bibliothèques restent nécessaires. Les mentions Mac/Windows ci-dessous décrivent l'objectif initial de portabilité, sans constituer un critère de sortie de la phase Mac actuelle.

## Préparation publique — #86 (2 novembre 2026)

Audit des secrets et des frontières de sécurité, licence MIT et README illustré sur données fictives. Le moteur reste local ; aucune fonctionnalité produit ni migration ajoutée. CI hébergée toujours manuelle. L’utilisateur a confirmé la conservation de l’historique ; la revue de publication inclut les scans #88 à #92. Voir [le rapport de préparation](security/public-readiness.md).

## Finitions Paper — #82 (1 novembre 2026)

Navigation repliée de 64 px, rail de fiche unifié, cartes au rayon28 et édition à géométrie constante. Les volets et le fond du sélecteur de disposition suivent les transitions validées, interrompables et immédiates en mouvement réduit. Volume et progression gardent leurs poignées contenues ; la liste de notes reste accessible en fenêtre basse. Les compromis non validés de l’audit ne sont pas intégrés. Voir [recette #82](design/82-paper-finishes.md).

## Gestion des tags — #81 (1 novembre 2026)

Un seul Enregistrer valide la fiche. Le + passe en édition, puis cocher/créer modifie directement le brouillon. Fermer le sélecteur conserve ces choix ; Annuler ne crée aucun tag. Renommer et supprimer se font dans Réglages → Tags, également accessible depuis le filtre. Les suppressions sont confirmées et conservent les prods/médias ; une ancienne fiche ne les annule pas silencieusement. Voir [contrat et conservation #81](design/81-tags-settings.md). Les finitions #82 restent séparées.

## Filtres et vocabulaire commun — #80 (31 octobre 2026)

Style et Ambiance sont regroupés en Tags. Les libellés déjà présents et leurs associations sont conservés ; seuls les libellés strictement identiques partagent une entité commune. Les variantes restent distinctes. Les tonalités de recherche se composent par Mode/Note puis Ajouter, avec plusieurs critères retirables. La tonalité d’une prod reste une valeur unique. Le BPM garde des bornes inclusives et une erreur réservée uniquement sous Maximum.

La création depuis Choisir mes tags sélectionne automatiquement la nouvelle valeur dans le brouillon ; Save valide l’association. Gestion centralisée et nouvelle rubrique Réglages → Tags restent dans #81, finitions/animations dans #82. Voir [référence et conservation #80](design/80-filters-tags.md).

## Référence active — 30 octobre 2026 (#78)

La refonte suit les pages Officiel actuelles de Paper : navigation latérale, bibliothèque au centre et fiche dans un volet qui réserve sa place. La fiche remplace la pop-up de prod des révisions précédentes. Sobre clair est le défaut ; les quatre palettes existent en clair et sombre. Les titres restent sur une ligne et les changements d’état gardent la géométrie.

Les deux dispositions sont maintenues : horizontale HC-04 de 136 px de haut, et grandes pochettes de hauteur largeur + 108 px. Les tags sont informatifs. Les filtres Style et Ambiance restent actifs. Les profils, imports YouTube, corrections, favoris et lecteur continuent à utiliser le catalogue existant. Aucun écran Mes sons, import MP3 extérieur ou association à un son n’est livré dans ce lot ; ces commandes indiquent Bientôt. Les réglages regroupent Diagnostic, Bibliothèque et Thèmes.

Les détails et arbitrages de cette référence qui remplace les anciennes dimensions sont dans [la recette #78](design/78-paper.md).

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

## Grandes pochettes compactes (#59, lot de #56)

La référence Paper officielle du 26/10 remplace la grande carte de 416 px par une carte de 365 px à largeur 265 px. Toute l’image commande Play/Pause, hors favori ; toute la zone inférieure ouvre la fiche sans effet sur l’audio. Cette zone unique contient titre monoligne, nom/durée puis BPM | tonalité et indication Détails. Les anciennes rangées Écouter et Détails séparées disparaissent. La hauteur vient du contenu, sans remplissage artificiel. Le favori reste une action sœur indépendante. Les mesures et tests sont dans [la revue des cartes](design/59-compact-covers.md).

## Finitions et transitions officielles (#56)

Les fenêtres et le lecteur reprennent les surfaces, flous et ombres de Paper. Les cartes restent immobiles pendant leurs retours de survol et de lecture ; seule l’icône se contracte à la pression. Les fenêtres entrent en 180 ms et sortent en 140 ms avec fondu et déplacement de 8 px ; une fermeture peut interrompre l’entrée. Le dialogue natif, le verrouillage de page et le focus restent actifs jusqu’à la fin de la sortie. Un brouillon empêche de démarrer cette sortie avant accord. Les préférences de mouvement/transparence réduits sont respectées. Voir [les valeurs et vérifications](design/56-fluid-finishes.md).

## États du dashboard (#57)

Un compteur unique présente les résultats dans l’en-tête. Une ligne de 22 px accueille la recherche et les filtres retirables ; les outils restent sous une zone de grille d’au moins 416 px, dont la hauteur est conservée pendant la session lorsqu’un état la réduit. Premier import et absence de résultat proposent leurs propres actions ; le lecteur vide est inactif. Les menus permettent l’effacement local et restaurent le focus ; recherche et autres filtres peuvent être réinitialisés séparément.

Le lien d’import reste visible, et erreur/reprise remplacent la progression dans un emplacement fixe de 20 px sous le champ. Ce format remplace les 24 px de #41. La disponibilité du moteur est vérifiée localement et distinguée d’un échec réseau d’import ; la reprise conserve la piste et sa position. Le bouton d’ouverture d’une bibliothèque est inactif sans chemin. Les mesures et scénarios sont dans [la vérification du dashboard](design/57-dashboard-states.md).

## Tonalités explicites et notation anglaise (#27)

À la demande de l’utilisateur du 28 octobre 2026, les tonalités s’affichent et se modifient en notation anglaise : `E minor`, `Ab minor`, `F# major`. Ce choix remplace leur traduction française dans les cartes et fiches Paper ; les libellés de l’interface restent en français.

L’import reconnaît Key, Clé/Cle, Tonalité/Tonalite et Gamme, les notes françaises ou anglaises avec un mode explicite, et les formes compactes dans un bloc musical comme `144bpm 🎵 / Abm 🎹`. Des indications contradictoires restent inconnues ; les mots courants, liens et adresses ne deviennent pas des notes. Les corrections et filtres utilisent la même normalisation.

Le bouton Actualiser complète aussi les tonalités manquantes depuis le titre et la description source conservés, sans téléchargement ni renommage du MP3. Une valeur déjà connue ou corrigée manuellement, même volontairement vidée, est préservée. Si la description a été réécrite, le texte source original conservé sert à cette extraction. Aucune analyse de marketplace ou de l’audio n’est ajoutée.

## Auteur du crédit et collaborations (#31)

Les crédits `prod by me`, `myself` ou `moi` ne confirment pas un nom d’artiste. Une règle de chaîne mémorisée peut résoudre l’auteur ; sinon, le nom de chaîne reste une proposition à vérifier. Les collaborateurs explicitement cités sont conservés : `prod by me x @m3nacebeats` sur prodlacco propose `prodlacco x @m3nacebeats`, sans inventer une graphie depuis Instagram, un copyright ou un email. Une correction utilisateur peut donner `Laco x @m3nacebeats`.

Une règle corrigeant un auteur ne remplace pas toute une collaboration et ne réinjecte pas un ancien invité dans une nouvelle prod. Une règle portant sur un crédit collectif n’est pas assimilée automatiquement à une personne. Sans auteur identifiable, `À préciser` signale la partie manquante, tout en gardant les collaborateurs connus. Des crédits explicites contradictoires restent à corriger. `Compositeur : Jake B` est aussi reconnu comme crédit explicite.

L’origine de la proposition se consulte au survol du champ Beatmaker et via sa description accessible, sans ajouter de ligne à la fiche. Actualiser recalcule les propositions automatiques depuis le texte source conservé ; les corrections manuelles, les anciennes valeurs sans provenance, les autres annotations et les fichiers restent préservés. Le regroupement en véritables profils beatmakers reste suivi dans #62.

## Visibilité de la progression d’import (#66)

À la demande de l’utilisateur du 29 octobre 2026, aucun rail ni pourcentage n’apparaît au repos. La progression accompagne l’import puis disparaît à l’ouverture de la fiche de la prod concernée ; elle ne revient ni à la fermeture de cette fiche ni lors des relevés suivants. Si un autre brouillon retarde l’ouverture, le suivi reste affiché jusqu’à la fiche attendue. Les erreurs et relances restent accessibles.

L’emplacement de 20 px et ses marges restent toujours réservés, même sans contenu visible, pour conserver la géométrie du dashboard. Ce comportement remplace le rail de repos à 0 % et le maintien de 100 % des anciennes références.

## Profils Beatmakers (#62)

La page Beatmakers propose recherche, création et consultation des profils : nom, photo locale, réseaux, sites de vente et compteur de prods. Les fiches gardent les mêmes champs et actions entre lecture et édition, avec sauvegarde, annulation et protection du brouillon. Aucun réseau social ou site marchand n'est interrogé automatiquement.

Une prod peut être liée à plusieurs profils distincts. Dans sa fiche, Associer ouvre la sélection multiple ; Utiliser la sélection prépare les associations, puis Save les enregistre avec les autres modifications. Les noms associés ouvrent les profils, qui permettent de retrouver leurs prods. Retirer une association conserve les crédits sources, les profils et les médias.

Les crédits explicites cohérents sont repris automatiquement avec une identité limitée à leur chaîne source. Les homonymes de sources différentes ne sont pas fusionnés. Une association manuelle unique dans la même chaîne peut corroborer un candidat sans ambiguïté. Les anciens crédits ambigus et les noms de chaîne non confirmés restent à associer manuellement ; un auteur seulement supposé depuis une chaîne ne devient pas silencieusement une identité personnelle.

La navigation Prods / Beatmakers conserve le lecteur et sa position. Une fin d'import attend la fermeture d'un profil en cours de consultation ou d'édition avant d'ouvrir la fiche de la prod. Les morceaux personnels restent dans #11 : aucun compte utilisateur ni écran Mes sons factice n'est ajouté à cette tranche.

## Identités et entretien des profils (#71)

Les variantes corroborées d’un même producteur sur sa chaîne sont des alias d’un profil canonique, notamment Samoss / SamossProd. Les anciennes références par nom et identifiant YouTube sont rapprochées uniquement si la correspondance de chaîne est unique. Les homonymes de chaînes distinctes restent séparés. Un profil proposé depuis la chaîne peut désormais exister, avec sa provenance visible ; un MP3 local sans auteur peut rester sans profil. Ce comportement remplace l’exclusion systématique des replis sur la chaîne de #62.

Dans une fiche beatmaker, Fusionner permet de choisir le profil à conserver, voir le nombre total de prods et les conflits avant confirmation. Les liens sont réunis et l’ancien nom devient un alias ; si les deux portraits diffèrent, celui du profil conservé prime. Supprimer demande confirmation, détache les prods et conserve leurs fichiers, crédits et autres collaborateurs. Les références retirées sont mémorisées pour empêcher une recréation automatique ; une nouvelle association explicite peut les rétablir.

Les portraits de chaînes correspondantes sont récupérés en arrière-plan et copiés dans la bibliothèque. Les imports et la lecture n’attendent pas cette opération. Une photo manuelle ou son retrait volontaire est prioritaire ; Photo YouTube permet une nouvelle demande. Un invité d’une collaboration ne reçoit pas le portrait de la chaîne qui publie la vidéo. Les échecs réseau laissent le repli visuel et permettent une relance.

## Portraits depuis la source YouTube (#74)

Le portrait suit directement la chaîne enregistrée de la prod, même si son nom diffère du crédit unique du beatmaker (Elegance / Elegance isn’t it?). Si l’identifiant manque sur un ancien import, il est récupéré depuis la vidéo d’origine. Aucun moteur de recherche ni handle deviné depuis un nom affiché. Les invités restent distincts et les images locales/manuelles restent prioritaires.

## Accès à la chaîne depuis le profil (#76)

Le profil affiche un lien Chaîne YouTube, ouvert dans un nouvel onglet, issu de l’identifiant connu de la chaîne source ou du handle explicitement crédité d’un invité. Plusieurs chaînes liées sont présentées séparément. Aucun lien n’est construit depuis un nom d’artiste supposé. L’emplacement du lien reste réservé en lecture, édition et chargement ; les profils sans source affichent Chaîne non renseignée.


## Mes sons — périmètre Paper validé (#11, 2 novembre 2026)

MP3 obligatoire à la création et lié sans copie ; une prod facultative par son, réutilisable. Cartes et fiche Officiel, états libres enregistrés immédiatement depuis les cartes, dates création/sortie facultatives, tags communs hérités/directs, Notes/Paroles et fenêtre agrandie, cover personnelle avec retour à celle de la prod sont dans le périmètre confirmé. Un seul Enregistrer dans la fiche et géométrie fixe. **Fonctionnalité planifiée, non livrée.** Le [contrat et les cinq lots](design/mes-sons.md) remplacent les anciens points à préciser et tout report de cover personnelle.


## Socle Mes sons — #96

Le moteur conserve désormais les morceaux, leur état/favori/dates et leur lien facultatif vers une prod. Le MP3 existant est choisi nativement sur Mac puis référencé sans copie : chemin relatif interne ou référence opaque vers un registre du poste. Fichier absent ou remplacé demande reconnexion sous la même identité. Les chemins externes ne sont pas exportés par les fiches ni stockés dans le catalogue portable. Les API sont protégées et les modifications vérifient une révision. **L’interface Mes sons reste dans #97** ; tags, textes et cover dans #98–100. Les tests seuls utilisent des bibliothèques migrées ; aucune migration de la collection personnelle dans ce lot.


## Mes sons — interface livrée (#97)

Le [lot interface](design/97-mes-sons-interface.md) active la galerie Mes sons, la fiche réservée à droite, les liens inverses et le lecteur partagé. Le moteur #96 est réutilisé sans migration supplémentaire : projection de la pochette/titre de prod et filtres/tri paramétrés ajoutés à GET songs. L'état de carte utilise un PATCH ciblé avec révision ; la fiche garde un Save unique et une garde de brouillon. Les tags, textes et cover personnelle restent dans #98–100, parent #11 ouvert.
