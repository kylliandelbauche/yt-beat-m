# Finitions et mouvement — Paper Officiel, #56

Référence unique : [Paper — Beat m / Officiel](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-1-0), fiche lecture/édition, Bibliothèque, Diagnostic, lecteur et planches d’interaction validées le 26/10. Mesures tirées des styles calculés et annotations Paper ; aucun prototype isolé repris. #55 a livré les champs stables et #59 les grandes cartes compactes et leurs actions séparées.

## Surfaces et retour physique

- Fiche : #1B222EF7, flou 20 px, ombre 0 24 80 en #00000085 et rayon 26 px. Bibliothèque/Diagnostic utilisent la base opaque #1B222E et les mêmes flou/ombre/rayon, comme leurs exports.
- Lecteur : #1E272DF5, flou 16 px, ombre 0 8 32 en #0000003D. Sa géométrie et l’audio persistent.
- Description : #222A36 en consultation, #101722 en édition, métriques de #55 inchangées. Fond général conservé.
- Survol/focus image : voile et contour menthe #C7EED980, surface #C7EED90F. Lecture active : contour #C7EED9 et Pause visible hors survol. La sélection réelle livrée dans #59 reste mémorisée après pause.
- Informations horizontales : survol discret et contour de focus intérieur ; contrôles fixes. Les deux dispositions conservent leurs dimensions.
- Pression : seul le SVG se contracte à 0,96, immédiatement ; activation native au relâchement du pointeur. Les couleurs/opacités de survol changent en 120 ms, sans transformer les cartes ou les cibles.

## Cycle des fenêtres

Le dialogue natif reste ouvert pendant toute l’animation : le navigateur conserve la modalité et la page reste verrouillée. Ouverture en 180 ms et fermeture en 140 ms, opacité et translation verticale de 8 px, sans rebond. Une fermeture pendant l’entrée annule l’animation courante et repart de son opacité/transform réellement affichés. Les demandes répétées de fermeture sont idempotentes.

Le garde de fermeture s’exécute avant l’animation : attente de sauvegarde ou choix de dossier bloquent la sortie ; un brouillon modifié demande confirmation sans commencer à faire disparaître la fiche. Abandon approuvé et opérations de bibliothèque réussies empruntent le même cycle. Les changements de bibliothèque sont appliqués à la fin du fondu, évitant de changer le contenu de la fenêtre pendant sa sortie.

Pendant la sortie, les autres contrôles sont inertes et le focus reste sur la fermeture. Les scrolls des champs sont conservés lors du transfert de focus. Au démontage, l’animation est nettoyée et le focus est restauré après le commit, sans recadrage. Si le déclencheur a été remplacé, la recherche ou le formulaire de bibliothèque sert de repli ; une autre fenêtre déjà ouverte garde son propre focus.

Mouvement réduit : fondu de 80/60 ms sans translation ; aucune contraction d’icône ni défilement automatique de titre. Transparence réduite : surfaces opaques et flous supprimés. Sans support du flou, les surfaces ont également un repli opaque. Les durées sont des choix Beat m validés dans Paper, pas des prescriptions garanties d’Apple.

## Vérifications

Les tests fonctionnels courants utilisent le mouvement réduit pour comparer la géométrie stable indépendamment de l’entrée/sortie. `fluid.spec.ts` active explicitement le mouvement normal et vérifie :

- Surfaces, flous, ombres, rayons et actions de 36 px sur les trois fenêtres ; géométrie des 22 textes de fiche en mouvement normal, après l’entrée.
- Interruption contrôlée à 60 ms de l’entrée : sortie de 140 ms depuis exactement la présentation courante, aucune attente du terme de l’entrée, verrouillage/focus/audio conservés jusqu’au démontage.
- Brouillon bloquant la sortie avant toute animation, puis abandon par le même cycle.
- Repos, survol, pression, lecture hors survol, pause, focus clavier et erreur audio des deux dispositions ; contraction du SVG sans déplacement des contrôles ou des cartes.
- Préférences de mouvement/transparence réduits et repli du focus lorsqu’une sélection de bibliothèque remplace le déclencheur.

Les tests attendent la disparition effective du dialogue avant d’agir sur la page arrière ; aucun délai arbitraire n’est ajouté. Les mesures des champs et textes de #55 et les contrôles des clics de #59 restent dans la suite. Les autres états du dashboard et les compteurs sont suivis dans #57 ; la recette matérielle Mac/Windows générale reste dans #8.

Lint/build frontend et 58 tests navigateur locaux réussis. Captures synthétiques relues : [surface de fiche](56-detail-surface.png), [cartes horizontales et lecteur](56-horizontal-states.png). Les dimensions, alignements et contrastes restent cohérents avec les exports Paper ; les nouveaux effets n’ajoutent aucun espace dans les champs ou cartes.
