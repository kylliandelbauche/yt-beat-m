# Finition UI/UX de Beat m — issue #49

Le 26 octobre 2026, une passe d’audit puis de finition a été appliquée à la bibliothèque existante. La référence reste Paper Officiel : pochettes dominantes, palette sombre et menthe, deux dispositions, fiche centrée et lecteur persistant. Le périmètre est une interface de travail, sans refonte de marque ni nouvelle fonction métier.

## Deux outils retenus

- [Impeccable, dépôt officiel de Paul Bakaus](https://github.com/pbakaus/impeccable/tree/3671d50f0ac9a662ce0615e85a256110c9cd720b/skill) : skill `impeccable`, références `audit`, `polish`, `operate` et `craft-floor`, commit `3671d50f0ac9a662ce0615e85a256110c9cd720b`, moteur `0.1.17`. Sources et moteur utilisés localement ; aucun hook ou dépendance ajouté à l’application. Le contexte a été chargé une fois et le détecteur mécanique exécuté après les corrections : zéro résultat sur les sept fichiers UI concernés. Une vérification ciblée de BeatGallery après la correction révélée par la CI retourne également zéro résultat.
- [Playwright](https://playwright.dev/) : version verrouillée du projet, Chromium, captures et scénarios réels sur bibliothèque synthétique. Inspection à 390, 900 et 1440 px, dans les deux dispositions, avec filtre et fiche ouverts. Les médias et annotations personnels ne sont pas utilisés dans les captures.

Les notes du Second cerveau consacrées aux outils de finition/frontend et aux couleurs ont orienté le choix. La référence Paper existante rendait inutile un outil supplémentaire d’extraction de style ou de génération de palette. Les compteurs d’installations et promesses commerciales n’ont pas servi de critères de qualité du rendu.

## Constats et changements

| Priorité | Constat vérifié | Correction appliquée |
| --- | --- | --- |
| P1 | La règle générique de survol remplaçait le fond menthe du bouton Importer, en conservant son texte sombre. | États survol/activation explicites, couleur et géométrie vérifiées dans le navigateur. |
| P2 | Les textes « actif » et les nombres ajoutés aux capsules faisaient varier leurs largeurs. | Emplacement de 15 px partagé entre chevron et compteur ; mêmes rectangles pour les catégories avant/après sélection. |
| P2 | Un chargement de filtre remplaçait brièvement les cartes par une grille plus courte, ce qui pouvait réinitialiser le défilement sur petite fenêtre. | Cartes conservées pendant la requête, grille annoncée occupée et état « Recherche… » ; réponse lente simulée dans un test dédié. |
| P2 | Les champs utilisaient des placeholders natifs et des surfaces/bordures peu cohérentes. | Tokens sémantiques pour champs, frontières, texte secondaire et survol ; contraste vérifié sur les valeurs réellement calculées. |
| P2 | La recherche se partageait une ligne étroite avec un filtre sur téléphone ; plusieurs contrôles mesuraient 38 px de haut. | Recherche pleine largeur ; filtres, tri, dispositions et outils à 44 px de haut sur petite fenêtre ou pointeur tactile. |
| P3 | Glyphes de recherche, chevrons, favoris et musique visuellement hétérogènes. | SVG du composant Icon partagé, même trait ; outils de bibliothèque identifiés par leurs icônes. |

Le tri et le sélecteur de disposition forment un groupe stable. Les métadonnées des cartes sont un peu plus lisibles et les nombres utilisent des chiffres tabulaires. Les cartes horizontales conservent 384 × 128 px ; les actions 36 × 36 px de la fiche approuvée restent inchangées. Le favori horizontal passe à 32 × 32 px sans agrandir la carte, celui des grandes pochettes à 44 × 44 px sur petite fenêtre.

La fiche et le lecteur gardent leurs parcours, données et dimensions. Les styles sont circonscrits dans `Refinements.css`, chargé après les styles Paper, pour éviter une réécriture des couches antérieures.

## Revue Impeccable

Notes manuelles de revue sur les cinq dimensions proposées par le skill, de 0 à 4. Elles synthétisent le périmètre inspecté ; elles ne sont pas produites automatiquement par le détecteur.

| Dimension | Avant | Après | Preuve / limite |
| --- | --- | --- | --- |
| Accessibilité | 2 | 3 | Contraste du bouton et des champs, focus, libellés et clavier vérifiés ; pas de certification exhaustive. |
| Performance | 3 | 3 | Images toujours différées, aucune dépendance ni animation ajoutée ; JavaScript compilé d’environ 79,7 à 80,0 Ko gzip. |
| Cohérence des couleurs | 2 | 3 | Tokens partagés sur le périmètre ; les autres styles historiques restent hors de cette passe. |
| Responsive | 3 | 3 | Recherche et cibles tactiles améliorées, géométrie vérifiée à trois largeurs ; pas de recette sur téléphone physique. |
| Intégrité d’implémentation | 2 | 3 | Icônes partagées, états stables, détecteur sans résultat sur les fichiers modifiés ; la référence Paper prime sur les préférences génériques du skill. |
| **Total** | **12/20** | **15/20** | Revue ciblée, avec les limites ci-dessus. |

Le contexte du moteur reconnaît le document produit existant comme un format antérieur et ne détecte pas automatiquement toute l’interface. Les sources React/CSS et captures ont donc servi de vérité visuelle. Une éventuelle initialisation du format de contexte Impeccable reste distincte de cette demande ; aucun document produit n’a été remplacé.

## Vérifications

- 41 tests navigateur réussis localement, dont six nouveaux scénarios de finition ; lint et build frontend réussis.
- Contraste calculé sur les styles rendus : placeholder/champ **7,78:1**, bordure/champ **3,20:1**, texte du bouton survolé/fond **12,83:1**. Le bouton dépasse 4,5:1 en repos, survol, focus et activation.
- Capsules de filtre : positions et dimensions identiques entre états inactif, tonalité sélectionnée et plage BPM appliquée à 390, 900 et 1440 px.
- Identité du lecteur, pause et position à huit secondes conservées pendant les changements de filtre. Une réponse lente est retenue explicitement : les cartes restent montées, aria-busy vaut true et le défilement reste à 90 px jusqu’à la réponse. Tests existants de lecture, fiche, focus, sauvegarde, import et fonctionnement hors ligne conservés.
- Petites fenêtres : recherche pleine largeur, contrôles principaux à 44 px, cartes horizontales de 128 px de haut, sans défilement horizontal.
- Les deux vérifications source retournent `[]` (passe complète, puis contrôle du fichier corrigé après CI). Le rendu a été inspecté séparément : l’absence de résultat du détecteur ne remplace pas cette inspection.
- La recette matérielle Mac/Windows demeure dans #8.

## Captures comparables

Données et pochettes synthétiques identiques ; aucune valeur illustrative ajoutée au catalogue personnel.

| | Avant | Après |
| --- | --- | --- |
| Ordinateur, 1440 px | [Capture](design/49-before-desktop.png) | [Capture](design/49-after-desktop.png) |
| Petite fenêtre, 390 px | [Capture](design/49-before-mobile.png) | [Capture](design/49-after-mobile.png) |
