# Livraison et validation

## Organisation

Le jalon `v0.1 — MVP local` regroupe les issues indispensables au parcours complet. Les évolutions restent dans un backlog séparé, sans date promise.

Une issue contient objectif, périmètre, dépendances, critères d'acceptation et vérifications. Une branche courte et une pull request référencent l'issue avec `Closes #N`. La description explique le résultat, la validation et les limites observées. Les changements de périmètre sont reportés dans les documents et les issues.

Le cadrage initial est un premier commit sur `main`. Le développement applicatif commence dans une branche dédiée à l'issue de fondation.

## Ordre proposé

| Étape | Résultat vérifiable | Dépendances |
| --- | --- | --- |
| 1. Fondation | Environnement reproductible, moteur local et interface minimale, CI | Aucune |
| 2. Bibliothèque | Catalogue versionné et fichiers déplaçables sans perte de références | 1 |
| 3. Import | Un vrai lien produit un MP3 lisible, une pochette et une fiche persistante | 1, 2 |
| 4. Interface | Grille et fiche sobres, états d'import et erreurs compréhensibles | 1, 2 |
| 5. Écoute | Lecture locale, pause, déplacement dans la piste et volume | 3, 4 |
| 6. Recherche | Tags modifiables, filtres, favoris et dates persistants | 2, 4 |
| 7. Localisation | MP3 sélectionné dans Finder et l'Explorateur Windows | 2, 4 |
| 8. Recette | Parcours complet, lanceurs, transfert physique et vérification hors ligne | 1 à 7 |

Éprouver l'import réel avant de consacrer l'essentiel du développement au style visuel. Présenter ensuite une tranche complète import → carte → écoute → localisation pour ajuster l'expérience avec l'utilisateur.

## Vérifications automatiques prévues

- Python : lint, tests des migrations, déduplication, transitions d'import, interruptions et limites de chemins ; travail sur dossiers temporaires.
- Frontend : typecheck, lint et build.
- API : filtres combinés, persistance des corrections, fichiers absents, requêtes Range et protection des actions locales.
- Navigateur : import simulé de manière contrôlée, apparition de la carte, lecture d'une fixture audio générée, déplacement dans la piste et conservation du lecteur pendant une recherche.
- CI Mac et Windows : chemins avec espaces/accents, racine déplacée, migrations et commandes de localisation via adaptateurs. Les appels système simulés ne prouvent pas l'ouverture réelle de Finder ou de l'Explorateur.

Pas de téléchargement YouTube live dans chaque exécution de CI : tests déterministes avec fixtures, puis essai réel avant recette. Ne pas inclure de prods personnelles dans le dépôt.

## Recette manuelle de sortie

- [ ] Coller une vraie URL et obtenir une prod lisible avec sa miniature ; contrôler les versions des dépendances utilisées.
- [ ] Réimporter la même vidéo via une autre forme d'URL : aucune duplication.
- [ ] Corriger beatmaker/BPM/tonalité, ajouter styles et ambiances, mettre en favori ; redémarrer et retrouver les changements.
- [ ] Rechercher une combinaison comme « R&B mélancolique » avec des tags renseignés.
- [ ] Écouter, mettre en pause, déplacer le curseur et changer de prod ; une seule piste audible.
- [ ] Couper Internet : grille, recherche, pochettes et écoute locales restent disponibles.
- [ ] Localiser le MP3 dans Finder, puis l'utiliser dans le logiciel de musique de l'utilisateur.
- [ ] Arrêter le moteur, éjecter le disque et ouvrir le dossier sur Windows ; vérifier catalogue, médias, tags et favoris.
- [ ] Localiser le MP3 dans l'Explorateur et l'utiliser sur Windows.
- [ ] Vérifier une vidéo indisponible, une dépendance absente, une interruption d'import et un disque non accessible ; aucune fausse réussite.
- [ ] Relever le système de fichiers réel du disque et le résultat du test de verrouillage.

Tant que la recette Windows sur machine réelle n'a pas eu lieu, la compatibilité Windows reste « prévue et testée automatiquement », pas « validée en usage réel ». Le jalon ne se ferme pas sur la seule base d'une démonstration visuelle.

## Après le MVP

Playlists complètes ; extraction de métadonnées depuis les marketplaces ; import de MP3 existants ; lien entre prod et morceau avec date d'utilisation ; analyse audio par IA. Ces fonctions ne bloquent pas la première tranche fonctionnelle.
