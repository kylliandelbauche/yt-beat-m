# Application de UI UX Pro Max — issue #51

Le 26 octobre 2026, le skill UI UX Pro Max a été appliqué à la typographie de Beat m, en conservant la direction Paper sombre/menthe et les composants stabilisés dans #49.

## Source et méthode

[Skill et données officiels](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/1f8857914da3c723d58dab1d609dd0d55a86bf51/src/ui-ux-pro-max), révision `1f8857914da3c723d58dab1d609dd0d55a86bf51`. Le script Python de recherche et ses données sont utilisés localement ; aucun moteur de recherche ni dépendance ajouté à l’application.

Les recherches se limitent à un besoin dominant, puis à une reformulation si les résultats sont hors sujet. Le moteur recherche des recommandations dans ses catalogues ; la sélection reste confrontée au produit, à sa langue et aux contraintes existantes.

| Recherche | Résultat et décision |
| --- | --- |
| `modern readable sans`, domaine typography | Remonte surtout des profils coréen, thaï et hébreu. Écartés pour cette interface principalement française. |
| `professional dashboard`, domaine typography | Remonte Dashboard Data, Modern Professional et Legal Professional. Le duo **Modern Professional #2, Poppins/Open Sans**, est retenu pour ses titres géométriques et ses textes humanistes lisibles. Les titres monospace de Dashboard Data ne sont pas appliqués ; le profil juridique n’est pas pertinent. |
| `music library`, domaine product | Remonte apprentissage instrumental et montage vidéo. Résultats écartés. |
| `music streaming`, domaine product | Remonte Music Streaming, avec pochettes, fond sombre et priorité au lecteur. Ces principes correspondent à la bibliothèque, sans ajouter ses fonctions sociales ou changer la palette Paper. |
| `font loading layout shift`, domaine ux | Deux règles Font Loading : préserver la mise en page, prévoir une police de repli et éviter le texte invisible pendant le téléchargement. Appliquées par préchargement local et `font-display: optional`. |
| `font loading`, puis `layout shift`, stack react | Aucun résultat aux deux recherches. Aucune recommandation spécifique React n’est attribuée au skill ; la mise en œuvre CSS s’appuie sur les règles UX précédentes et le système existant. |

Aucun nouveau MASTER généré ni palette imposée : cette demande porte sur une interface existante. La référence Paper et les prescriptions de stabilité de l’utilisateur priment sur les valeurs génériques du catalogue.

## Application à Beat m

- **Poppins 600** : marque, titres de section, titres des cartes, titre de la fiche en lecture et en édition.
- **Open Sans variable 400–700** : contrôles, beatmakers, descriptions et données musicales. Deux fichiers locaux totalisent 56 320 octets ; leurs licences et leur provenance accompagnent les assets.
- Titres de cartes : 15 px ; cartes horizontales : 13 px, deux lignes de 18 px. Description : 13 px et interligne de 22 px ; libellés de fiche : 11 px. Chiffres tabulaires pour BPM, durée et compteurs.
- Famille, taille et interligne du titre de fiche sont identiques en lecture et en édition. Le conteneur reste fixe ; la description conserve 280 px de haut, les cartes horizontales 128 px et les actions de fiche 36 × 36 px.
- La palette, les pochettes, le lecteur, le filtrage et les données restent inchangés.

Les styles de rôle sont définis dans `Typography.css`, après les styles Paper et la finition #49. Les alias `--font-heading` / `--font-text` et les tailles de rôle évitent de distribuer de nouvelles valeurs dans les composants.

## Chargement et fonctionnement hors ligne

Les deux WOFF2 sont préchargés depuis `/fonts/`, servis par le même moteur que l’interface. Les fichiers sont inclus dans le build et leurs licences SIL OFL 1.1 dans `frontend/public/fonts`. Aucun appel à Google Fonts n’est effectué par l’application.

`font-display: optional` permet de garder la police système si le fichier n’est pas disponible assez vite pour ce chargement, plutôt que de remplacer tardivement les glyphes et déplacer l’interface. Un chargement suivant peut utiliser les polices mises en cache. Les caractères hors de la couverture latin utilisent également un repli local. C’est une adaptation explicite des options swap/optional proposées par le skill. Référence navigateur : [MDN — font-display](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display).

## Vérifications

- Polices effectivement chargées depuis l’origine locale, familles calculées vérifiées, accents affichés dans les vrais titres de fixture.
- Requêtes externes bloquées pendant ouverture, lecture, édition et rechargement ; zéro tentative distante.
- Requêtes des deux polices volontairement retenues au-delà de la fenêtre initiale, puis libérées : interface de repli visible et rectangles inchangés après téléchargement.
- Titre lu/édité à la même position et aux mêmes dimensions ; description toujours à 280 px ; lecteur, pause et position conservés.
- Scénarios existants de titres longs, filtres, fiche et contrôles aux dimensions fixes vérifiés avec les nouvelles polices.
- La recette matérielle générale demeure dans #8 ; les vues mobiles sont des fenêtres Chromium émulées.

## Captures synthétiques

Les données et pochettes de démonstration sont identiques à #49. Les captures de #49 servent de référence avant cette passe, sans dupliquer les mêmes fichiers.

| Vue | Avant | Après |
| --- | --- | --- |
| Ordinateur, 1440 px | [Avant](design/49-after-desktop.png) | [Après](design/51-after-desktop.png) |
| Petite fenêtre, 390 px | [Avant](design/49-after-mobile.png) | [Après](design/51-after-mobile.png) |
