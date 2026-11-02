# Mes sons — contrat validé et découpage

Statut au 2 novembre 2026 : **cadré, non implémenté**. Parent [#11](https://github.com/kylliandelbauche/yt-beat-m/issues/11), préparation #95. Les références sont lues dans [Paper / Mes sons](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-H-0), sans modifier les maquettes. Les cadres Officiel sont validés même si la page s'appelle encore Propositions. Aucun visuel, parole illustrative ou donnée personnelle de Paper n'est importé dans le dépôt.

## Décisions et données

MP3 existant obligatoire à la création, lié sans copie ni renommage. Un son a zéro ou une prod ; une prod peut être liée à plusieurs sons. UUID stables indépendants des noms et des chemins. Une perte de fichier/disque conserve le morceau ; Changer le fichier lié reconnecte le média. Création et sortie sont facultatives et distinctes de l'ajout automatique. Favori propre au son. Un seul utilisateur local ; aucun modèle de compte ajouté par anticipation.

L'état est libre : Topline (micro), Maquette (mur de briques en construction), Mixage (réglages), Master (disque), Out (sortie/publication). **Depuis une carte, le changement s'enregistre immédiatement**, sans Save supplémentaire. Cette action ne doit ni écraser ni enregistrer les autres champs d'un brouillon ouvert : réutiliser sa garde avant une modification extérieure. Dans la fiche, l'état participe à l'unique Enregistrer avec tous les champs. Aucune progression ni date automatique fabriquée.

## Références graphiques

| Référence Officiel | Contrat |
| --- | --- |
| SON-01/02 et Cartes sons · État large, lien compact | Horizontale368×136, verticale344×468 de référence ; titre et tags sur une ligne défilable, sans +2 ou séparateur horizontal. État sous titre ; prod et favori indépendants. Aucun beatmaker sur le son. Écarts12, contrôles32/rayon7. |
| SON-FP-01 · Informations · Image puis état | Volet droit réservé, sans superposition. Titre, pochette, état+Prod, tags, dates, actions fichier. Cadre image272×152, image272×272/top−60 ; pas de bandes noires ajoutées. Prod+liaison centré124×32/rayon7, écart12 avec état, sans titre de prod. |
| SON-DESC-01/02 | Notes et Paroles hors Informations, dans Description ; sélecteur pleine largeur, indicateur160ms ou immédiat en mouvement réduit. Bloc fixe défilant, Agrandir à l'intérieur en haut à droite. |
| PAR-01 | Fenêtre agrandie800×680 de référence, adaptée à la fenêtre. Même texte, mode et brouillon ; fermer/Échap/clic extérieur revient au volet sans Save implicite ni perte de focus/audio. |
| Cover du son · Changer et revenir à la prod | Bouton Image32/rayon7/inset12 ; menu Choisir une image… / Image de la prod, source active cochée. La cover personnelle est incluse, tout ancien report est remplacé. |

Les dimensions sont des références grand écran ; relever de nouveau les valeurs natives au lancement de chaque lot. SON-FP-02 et anciennes variantes en Historique sont écartées. Priorité Mac/clair/grand écran ; conserver les thèmes existants et l'accès aux actions sur petite fenêtre.

## Tags et pochettes

Un seul `catalog_tags`, partagé avec les prods, et associations directes aux sons par identifiants. Héritage dynamique depuis la prod et union dédupliquée pour galerie/recherche/filtre. Dans la fiche, Liés à la prod = badges bordés avec liaison d'en-tête ; Ajoutés au son = badges pleins et + fixe. Un même ID dans les deux sources s'affiche une seule fois avec mention Prod + son. Changer/retirer la prod renouvelle l'héritage, jamais les associations directes. Les tags hérités s'éditent dans la prod. Renommage/suppression globaux respectent #80/#81, leurs alias et leurs protections contre un brouillon obsolète ; pas de résurrection silencieuse.

Pochette héritée par défaut. Une image personnelle est choisie via le sélecteur Mac, prévisualisée en édition, puis appliquée à fiche/cartes/lecteur par le Save de la fiche. Annuler restaure l'image précédente. La prod reste intacte ; une cover personnelle survit au changement de prod. Revenir à Image de la prod réactive l'héritage ; sans prod ni cover propre, repli neutre. Stocker l'image personnelle dans la bibliothèque portable avec validation de type/taille et gestion des échecs, pas seulement un chemin externe ni une URL téléchargée arbitrairement.

## Édition, audio et sécurité

Un seul Enregistrer pour état, prod, cover, tags, Notes, Paroles et dates. Crayon→Enregistrer36 au même endroit avant le cœur ; Annuler réservé, cœur à droite. Aucun changement de position, dimension ou origine du texte entre lecture/édition/attente/succès/erreur ; messages hors flux. Changer de rubrique conserve le brouillon ; fermeture/navigation protège les modifications. Les deux champs textuels restent distincts et non exécutables, bornes à documenter au lancement.

Le lecteur unique s'étend aux deux types d'entités ; il reste monté et conserve temps/volume/focus pendant les consultations. Son titre/pochette ouvre la fiche du son ou de la prod active. Un fichier absent n'est pas présenté comme lisible. Les références externes des MP3 doivent être définies au lot socle : chemins relatifs pour les fichiers internes si possible, références locales propres au poste pour les autres, sans promesse de transfert automatique. UUID de média explicitement choisi, jamais endpoint lisant un chemin arbitraire. Préserver session/Origin, sauvegardes et migrations transactionnelles ; aucun effacement/renommage d'original.

## Lots et validation

1. [#96 — Mes sons — Entité morceau, MP3 lié et relation avec les prods](https://github.com/kylliandelbauche/yt-beat-m/issues/96)
2. [#97 — Mes sons — Bibliothèque, cartes et fiche liées au lecteur](https://github.com/kylliandelbauche/yt-beat-m/issues/97)
3. [#98 — Mes sons — Tags communs, héritage dynamique et gestion globale](https://github.com/kylliandelbauche/yt-beat-m/issues/98)
4. [#99 — Mes sons — Notes, paroles et fenêtre agrandie à brouillon unique](https://github.com/kylliandelbauche/yt-beat-m/issues/99)
5. [#100 — Mes sons — Cover personnelle avec retour à l’image de la prod](https://github.com/kylliandelbauche/yt-beat-m/issues/100)

Les lots restent Open, sans worklog d'implémentation avant le go. Le présent cadrage est seul mesuré sous #95. Chaque lot décrit ses dépendances et recettes ; #11 se ferme après intégration des cinq.

Recette utile : migration/réouverture sans perte, deux sons sur une prod, remplacement/retrait et retour inverse, fichier extérieur absent puis reconnecté, empreintes conservées ; union des tags et anciens brouillons ; état carte immédiat sans écraser la fiche ; Notes/Paroles et agrandi au même brouillon ; cover personnelle/héritée, annulation et échec atomique ; dimensions/textes/actions, clavier/focus et audio. Réutiliser les tests déjà valides, ajouter seulement les garanties affectées. Aucun média personnel ni CI hébergée. Écoute physique et logiciel musical restent des gestes utilisateur.

Hors périmètre : plusieurs prods par son, comptes/cloud/partage, synchronisation, DAW et mixage navigateur, copie automatique des MP3, publication musicale, chantier Windows et lanceur.
