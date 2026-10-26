# Fiche stable — Paper Officiel, issue #55

Référence : [Paper — Beat m](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-1-0), écrans Officiel « Détail prod · Lecture », « Détail prod · Édition », « Détail · Erreur de sauvegarde » et planche des champs, validés le 26 octobre 2026. Les styles calculés et exports JSX ont servi de source ; aucun prototype isolé n’a été repris.

## Correction

Les champs natifs restent montés en consultation et en édition. Leur attribut readonly change ; leurs dimensions, polices, interlignes, paddings et bordures réservées restent identiques. Cela évite aussi les écarts de ligne de base entre texte HTML et éditeur natif.

- Titre : emplacement 52 px, padding 8 × 10, Poppins 600 en 26/34. Le même input conserve son décalage horizontal. Le défilement de consultation au survol/focus s’arrête à la position courante et respecte le mouvement réduit. Aucun autofocus au changement de mode.
- BPM/tonalité : champs 28 px, padding horizontal 3, bordure 1, Open Sans 600 en 18/26. Le format français de la tonalité est identique en lecture/édition et reste accepté par la normalisation du moteur ; une valeur inchangée n’est pas renvoyée dans le PATCH.
- Beatmaker : champ 22 px, padding horizontal 2, bordure 1, Open Sans 500 en 14/20. Chaîne source distincte et sans fond de champ éditable.
- Description : même textarea de 280 px, padding 14, bordure 1, Open Sans 13/22 et mêmes retours à la ligne. Scroll conservé ; fond #222A36 en consultation et #101722 en édition.
- Vente : emplacement 42 px, padding 6 × 10 et bordure réservée. Libellé 9/12 et URL 11/16 restent ancrés ; un lien superposé ouvre la page en consultation. L’URL reste un input dans les deux modes.
- Une place est réservée à Annuler dans l’en-tête ; sa visibilité change sans déplacer le libellé. Favori, édition/sauvegarde et fermeture gardent leurs trois cibles de 36 × 36.
- Échec de sauvegarde : retour hors flux dans l’en-tête, brouillon conservé, Réessayer et Annuler accessibles. Les erreurs de saisie sont textuelles et reliées aux champs par aria-invalid/aria-describedby. Le focus de sauvegarde est restauré sans recadrage si sa désactivation l’a temporairement perdu.

Les changements de surfaces/ombres des fenêtres et de cartes restent dans #56 ; les autres états du dashboard restent dans #57. Pas de migration, modification de médias ou nouvel accès réseau.

## Preuve de stabilité

`detail-fields.spec.ts` mesure 22 groupes de texte : titre, libellé d’en-tête, trois repères musicaux et leurs libellés, identités, dates, description et son libellé, vente et son libellé, fichier et YouTube. Les rectangles des contrôles, polices, bordures et paddings sont comparés strictement entre états.

Les rectangles de texte et les lignes sont lus dans le DOM rendu de Chromium, y compris ses éditeurs natifs via le protocole de débogage. Il ne s’agit pas d’un miroir CSS calculé à partir de l’implémentation. Les coordonnées de texte sont comparées au millième de pixel ; le défilement du conteneur mobile est compensé pour distinguer navigation volontaire et mouvement interne des champs.

Scénarios : ordinateur et petite fenêtre (sans refonte de cette dernière), métadonnées présentes/absentes, titre long déjà décalé, description longue déjà défilée, consultation → édition → attente → erreur → relance → succès → annulation, protection du brouillon, focus et audio conservés. Le défilement automatique est également vérifié sans mouvement réduit, ainsi que la validation d’un titre vide.

Les tests existants de persistance gardent leurs garanties : les assertions sur des textes HTML sont adaptées à des valeurs readonly, avec attente explicite de la confirmation de sauvegarde avant fermeture.

Captures de recette avec contenu synthétique, déjà défilé : [consultation](55-read-desktop.png), [édition](55-edit-desktop.png), [échec de sauvegarde](55-error-desktop.png). Leur comparaison visuelle confirme les mesures des champs et des textes ; elle ne valide pas les autres finitions de #56.
