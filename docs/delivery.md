# Livraison et validation

## Priorité actualisée — 29 octobre 2026

À la demande de l'utilisateur, #8 se concentre sur les vérifications essentielles Mac. Windows et le lanceur à double-clic sont reportés ; ils ne constituent plus une condition avant Beatmakers (#62), puis Mes sons (#11). Le lancement documenté existant suffit à cette phase. La CI conserve les contrôles Mac et suspend la matrice Windows, sans retirer les adaptateurs ou la portabilité des données.

La recette complète historique ci-dessous sert de référence. Pour la phase actuelle, consigner séparément les essais Mac réalisés, les scénarios déjà couverts par les tests automatisés et les gestes restant à confirmer par l'utilisateur (écoute physique, glisser le MP3 dans son logiciel, disque externe). Ces gestes et les scénarios Windows reportés ne doivent pas être présentés comme validés. Éviter de rejouer des contrôles inchangés sans échec ni garantie manquante.

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

## Validation du lecteur (#5, 29 octobre 2026)

- Les tests navigateur vérifient les contrôles natifs au clavier sur un véritable MP3 synthétique : durée, pause/reprise, déplacement et volume. Le remplacement de piste conserve volume et mode muet, avec un seul élément audio. Les tests existants couvrent la continuité pendant recherches, filtres, changements de disposition et consultation/édition de fiches.
- Des réponses HTTP 404 et un contenu MP3 indécodable provoquent de vraies erreurs du navigateur, sans événement error artificiel. Depuis la carte comme depuis la fiche, Play redevient disponible, le message explique le problème de fichier et un nouveau Play réussit après rétablissement de la source. La fiche affiche l'erreur au-dessus de son contenu, conserve un brouillon en cours et rend le focus à Play après masquage. Les positions et dimensions du lecteur, de la bibliothèque et de la fiche sont comparées à 1280 et 390 px.
- Un import contrôlé publie un MP3 et une pochette synthétiques ; une nouvelle instance du moteur restaure le catalogue et restitue les mêmes octets, y compris une lecture Range, avec connexions Internet et lancement du téléchargeur interdits. Un manifeste momentanément absent produit une erreur récupérable pour les deux médias. Le navigateur vérifie aussi la pochette, la recherche, la lecture et le déplacement après rechargement, cache désactivé et requêtes Internet bloquées.
- Les tests API couvrent les réponses audio 200/206/416, le fichier absent et le refus de chemins sortants et de liens symboliques pour l'audio comme pour la pochette. Ces vérifications n'altèrent pas les médias personnels.

Ces contrôles automatisés consolident #5. Le téléchargement YouTube est simulé dans ces scénarios ; la recette avec un import réel, la sortie audio du poste et le débranchement physique du disque restent à consigner dans #8.

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

La compatibilité Windows reste « testée automatiquement avant son report », pas « validée en usage réel ». Sa recette physique est différée depuis le 29 octobre et ne bloque plus la phase Mac ni les nouvelles fonctionnalités. Les éléments Mac non vérifiés restent explicitement ouverts.

## Après le MVP

Playlists complètes ; extraction de métadonnées depuis les marketplaces ; import de MP3 existants ; lien entre prod et morceau avec date d'utilisation ; analyse audio par IA. Ces fonctions ne bloquent pas la première tranche fonctionnelle.
