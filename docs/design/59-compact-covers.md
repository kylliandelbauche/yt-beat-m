# Grandes cartes compactes — #59, lot de #56

Référence unique : [Paper Officiel — Beat m](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-1-0), Accueil · Grandes pochettes et sa planche d’états validées le 26/10. Mesures tirées des exports JSX et styles calculés de la nouvelle référence ; les cartes de 416 px restent dans Historique. Aucun prototype isolé repris.

La largeur de référence reste 265 px, bordure 1 px et rayon 22 px. La pochette intérieure fait 263 × 263. Le bloc inférieur résulte du contenu : padding 14 × 18, gaps 8, titre réservé 23 px (Poppins 600, 15/22,5), ligne nom/durée 17 px, dernière ligne 16 px. Total : 100 px sous l’image et 365 px avec les bordures, sans min-height ou spacer de remplissage. Musique en Open Sans 11/15, valeurs directes et séparateur de 1 × 10 px ; Détails à droite. Les valeurs absentes restent —.

Trois boutons sont frères : favori, image pour Play/Pause, informations pour les détails. Aucun gestionnaire de lecture sur le parent ou le bloc inférieur. Titre, nom, durée, musique, indication Détails et espaces de padding/gap appartiennent au même bouton de détails. L’indication Détails est un span, sans arrêt clavier supplémentaire. Le défilement du titre suit désormais le survol/focus de cette zone.

L’image affiche le contrôle 40 × 40 et un voile au survol/focus. Le cœur reste au-dessus. Le bloc d’informations change légèrement de surface et colore Détails en menthe ; les contours de focus restent hors du flux. La sélection visuelle n’est activée qu’après un événement audio play réel et reste identifiée après pause. Les autres surfaces et transitions générales sont encore dans #56.

Vérification : clic sur chaque texte, padding haut/bas et gap du bloc inférieur pendant une autre piste en pause puis en lecture ; source, identité, état et événements play/pause/emptied/seeking inchangés à l’ouverture des détails. Favori indépendant et restauré à sa valeur initiale. Image/clavier pour Play/Pause, reprise de la même piste, trois cibles non imbriquées. Mesures 265 × 365, image 263 × 263 et bloc 263 × 100 avec titres/métadonnées longs ou absents, puis invariance au survol, focus, lecture et pause. Les contrôles de fiche #55 restent dans la suite de tests.

Lint/build frontend et 52 tests navigateur locaux réussis, incluant les contrôles de fiche #55. [Capture de validation synthétique](59-compact-covers.png) comparée à la nouvelle référence Paper : dimensions, rythme des trois lignes et zones d’action cohérents.
