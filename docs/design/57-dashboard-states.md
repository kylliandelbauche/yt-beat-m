# Dashboard et états officiels — #57

Référence : [Paper — Beat m, ligne Officiel](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-1-0), consultée le 28 octobre 2026. Implémentation depuis les exports JSX et styles calculés ; aucune reprise du prototype externe ou des propositions après MVP.

## Mesures reprises

| Élément | Référence / intégration |
| --- | --- |
| Espacement après le header | 20 px |
| Champ et bouton d’import | 46 px de haut ; bouton 130 px de large |
| Suivi sous le champ | 7 px d’écart, emplacement fixe de 20 px |
| Titre de bibliothèque | emplacement de 48 px ; compteur unique |
| Barre de filtres | minimum 54 px ; retour à la ligne sur petite fenêtre |
| Ligne de statut | 22 px, dont 6 px de marge basse ; vide au repos sans filtre |
| Zone de grille | minimum 416 px dans les deux dispositions et les états vides |
| Outils du bas | minimum 54 px, dont 18 px de marge haute |
| Menu de filtre | 296 px de large, padding 12 px, rayon 14 px ; défilement interne |
| Indicateur de capsule | 15 × 15 px, conservé de #49 |

La hauteur nécessaire à une grande grille est conservée durant la session de bibliothèque, même quand une recherche la réduit ou que le moteur devient indisponible. Cela évite de remonter les outils du bas et de tronquer le défilement. Les cartes restent présentes pendant une recherche en cours. Les filtres retirables et leur réinitialisation occupent une ligne défilante sans augmenter la hauteur du dashboard ; les messages d’opération se superposent dans cette zone. Les cibles tactiles et adaptations existantes sont conservées, sans nouvelle maquette mobile.

## Fonctionnement

- Le nombre de résultats figure uniquement dans l’en-tête. La ligne de statut annonce la recherche ; les publications inconnues en fin de tri sont expliquées aux technologies d’assistance.
- Sélection multiple immédiate dans un menu restant ouvert, effacement local « Tout effacer », sélection et focus distincts. Échap et clic extérieur neutre rendent le focus à la capsule sans scroll ; un clic sur un autre contrôle conserve sa destination. Le tri natif conserve quatre choix et une seule sélection, avec fermeture native après choix ; disposition directement adjacente.
- Premier import : accès au champ URL ou à la bibliothèque existante ; lecteur vide, sans source et inactif. Aucun résultat : effacement de la recherche et réinitialisation des autres filtres distincts, sans changer la piste.
- Le lien d’import reste saisi après mise en file, erreur et réussite. Le bouton du formulaire devient Réessayer à la même place. L’erreur remplace la progression dans le même emplacement de 20 px, avec défilement interne pour un texte long. Le suivi interrompu peut être relancé sans réimporter la vidéo.
- La barre utilise seulement le pourcentage réel du téléchargement ; les autres phases restent indéterminées et 100 % signifie prêt. Le repos affiche une piste vide sans annoncer une tâche active. La fiche s’ouvre automatiquement selon les garanties existantes de #39, y compris la protection du brouillon.
- La disponibilité du moteur est vérifiée sur `/api/health` toutes les quatre secondes, avec un délai limite de 2,5 s. Le signal ne dépend ni de l’accès Internet ni du succès d’un import. Une panne donne le repère ambre, Réessayer et Diagnostic ; les contrôles dépendants sont désactivés. La reconnexion recharge catalogue et filtres sans remplacer l’élément audio existant. La reprise rend le focus à la recherche si son déclencheur a disparu et qu’aucune autre surface n’a pris le focus.
- Le bouton d’ouverture d’une bibliothèque reste inactif sans chemin non blanc. Les erreurs de cette fenêtre et des BPM ont des emplacements réservés, avec champs et actions stables. Le choix natif, l’annulation et la saisie manuelle existants sont conservés.

## Couverture des 12 références Officiel

| Référence | Vérification |
| --- | --- |
| Accueil · Grandes pochettes | cartes compactes, compteur, zone de grille, outils |
| Accueil · Cartes horizontales | même zone, commandes et piste conservées |
| Import · Progression | valeurs intermédiaires, conversion indéterminée, erreur et relance |
| Détail prod · Lecture | ouverture automatique, audio et focus, tests existants |
| Détail prod · Édition | brouillon, géométrie des champs et des actions, tests existants |
| Bibliothèque · Ouvrir un dossier | bouton inactif sans chemin, erreur sans déplacement, choix natif simulé |
| Diagnostic · Prêt à importer | dépendances disponibles ou manquantes et reconnexion |
| Filtres · Tonalité ouverte | menu, sélections, effacement, scroll et focus |
| Bibliothèque · Premier import | deux actions et lecteur inactif |
| Recherche · Aucun résultat | deux remises à zéro indépendantes et piste conservée |
| Moteur · Déconnecté | panne initiale ou en session, reprise, diagnostic et géométrie |
| Détail · Erreur de sauvegarde | erreur et brouillon préservé, suite existante |

Les tests navigateur utilisent uniquement un catalogue et de l’audio synthétiques. Les huit scénarios de `dashboard.spec.ts` couvrent notamment 1280 et 390 px, les coordonnées du titre, des filtres, de la grille et des outils, les cinq états d’import, les erreurs BPM/bibliothèque, une grande grille et la reprise d’une panne initiale. La suite existante contrôle aussi les 22 repères de texte des fiches, les transitions, la persistance des corrections et les parcours audio. Les captures jointes illustrent premier import, aucun résultat, déconnexion et erreur d’import. Aucune valeur musicale ou date illustrative de Paper n’est injectée au catalogue.

Captures : [premier import](57-first-import.png), [aucun résultat](57-no-results.png), [moteur déconnecté](57-engine-offline.png), [erreur et relance d’import](57-import-error.png).

## Limites

Une connexion moteur rétablie n’est pas une garantie d’accès Internet. Une piste déjà chargée n’est pas interrompue par l’interface ; une lecture nécessitant des octets encore absents peut néanmoins échouer lorsque le moteur est arrêté. Aucun schéma, média personnel, règle d’extraction ou mécanisme de protection de l’API n’a changé. La recette matérielle Mac/Windows et disque externe reste suivie dans #8.

Les contrôles audio natifs sont conservés : temps et curseur suivent l’élément audio réel, initialement à 0:00. Chromium peut aussi dessiner les octets mis en mémoire tampon sur sa piste ; ce repère de chargement ne représente pas du temps déjà écouté. Les seules barres rendues par l’application dans cette issue sont celles de l’import.
