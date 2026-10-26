# Titres sur une ligne — Paper, 26 octobre 2026

Issue : #53. Référence unique : [Paper — Beat m](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-1-0), propositions « À valider » du 26/10, consultées à la demande de l’utilisateur. Sources : exports JSX et styles calculés des cartes et de la fiche lecture/édition. Le prototype isolé n’a pas été consulté ni repris.

## Mesures reprises

| Élément | Référence Paper | Intégration |
| --- | --- | --- |
| Grande pochette | 265 px, titre Poppins 600, 15 / 22,5 px ; marges 18 / 18 / 12 px, écart de 8 px vers les métadonnées | Une ligne, fondu de 20 px en cas de débordement ; métadonnées dans une ligne réservée de 17 px |
| Carte horizontale | 384 × 128 px, pochette 127 px ; texte avec padding 13 × 14 px | Titre de 18 px de haut, Poppins 600 en 13 / 18 px ; écart de 6 px vers le beatmaker et les informations musicales |
| Titre de fiche | Emplacement de 52 px, padding 8 × 10 px, bordure de 1 px, rayon 10 px | Même boîte en lecture et édition, texte Poppins 600 en 26 / 34 px ; champ texte sur une ligne |
| Colonne de fiche | Espacement vertical 20 px, identité 62 px, dates 50 px, description 304 px dont zone de 280 px | Suppression de la réserve pour une deuxième ligne de titre ; fiche de référence 900 × 652 px conservée |
| Texte tronqué visuellement | Masque de 20 px à droite ; titre complet dans le contenu | Défilement au survol/focus, désactivé avec mouvement réduit ; attribut de titre complet et nom accessible conservés |

Sur petite fenêtre, le titre conserve sa boîte de 52 px ; la taille existante de 22 / 29 px s’applique en lecture et édition. La disposition mobile reste adaptée à la fenêtre. L’éditeur permet de déplacer le curseur dans tout le titre sans agrandir la fiche ; les données ne sont pas tronquées. Le titre du lecteur persistant était déjà sur une ligne et conserve son raccourci vers la fiche.

## Vérification

Les tests navigateur couvrent titres courts et très longs, cartes alignées dans les deux dispositions, trois largeurs (1280, 900 et 390 px), passage lecture → édition → sauvegarde sans déplacement des colonnes, envoi du titre complet, lecture audio conservée, focus restauré et mouvement réduit. Les tests existants vérifient aussi le défilement au clavier, les erreurs et l’annulation sans déplacement.

Les autres propositions Paper (surfaces, ombres et transitions de la fiche) ne font pas partie de cette issue.

Contrôles locaux : lint et build frontend réussis, 46 tests navigateur réussis. Captures de validation avec catalogue synthétique : [fiche ordinateur](53-detail-desktop.png), [cartes horizontales sur petite fenêtre](53-horizontal-mobile.png). La comparaison visuelle a porté sur le titre, ses espacements et la stabilité des colonnes ; elle ne prétend pas valider toutes les propositions de finition du board.
