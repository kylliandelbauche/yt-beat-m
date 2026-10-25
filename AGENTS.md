# Instructions du projet

Lire `docs/product.md`, `docs/architecture.md` et l'issue concernée avant une modification substantielle. Ne pas élargir le MVP sans le consigner. Utiliser une branche et une PR liée à l'issue ; vérifier avant de fusionner.

## Suivi demandé par l'utilisateur

- Kanban GitHub : https://github.com/users/kylliandelbauche/projects/2 ; statuts Open → In progress → In review → Done. Closed signifie fermé sans livraison. Une issue livrée est fermée comme completed et son statut projet devient Done.
- Au début d'une issue, lancer `python3 scripts/worklog.py start NUMERO`. Au passage en revue, actualiser le statut. À la fin, lancer `python3 scripts/worklog.py finish NUMERO --publish` pour inscrire temps et tokens dans un commentaire de l'issue. Mentionner le périmètre réellement mesuré et les vérifications dans ce commentaire.
- Les compteurs de tokens proviennent uniquement de la télémétrie locale de cette conversation : différence entre deux relevés, entrées incluant le cache et sorties ; le raisonnement est un sous-ensemble des sorties. Ne pas additionner les sous-ensembles deux fois. Ce ne sont ni une facture ni une conversion en pourcentage d'abonnement. Si absent, réinitialisé ou incohérent, écrire « non disponible » et expliquer.
- Le temps est du temps écoulé entre début et fin du segment, comprenant outils et attente de CI ; ce n'est pas du temps humain actif. Les opérations communes de préparation peuvent être consignées à part.
- À chaque fin de tâche dans le chat, consulter `get_usage_limits` et indiquer les pourcentages restants pour chaque fenêtre disponible (5 heures et semaine actuellement). Ces quotas sont partagés par le compte, pas propres à cette issue. Si la lecture échoue, dire que le relevé est indisponible ; ne pas réutiliser un ancien relevé comme s'il était actuel.
- Ne jamais publier les journaux de conversation, jetons, chemins personnels ou autres données d'authentification. Seuls les compteurs agrégés et les dates de mesure peuvent être publiés.

## Stabilité visuelle demandée par l’utilisateur

Les changements d’état d’un composant (lecture, édition, chargement, sauvegarde, succès, erreur) doivent conserver les dimensions et positions du contenu et des actions. Utiliser un emplacement réservé ou une confirmation hors du flux ; ne pas insérer un message qui décale la page. Préserver aussi le focus et la lecture audio. Vérifier la géométrie du contenu et des boutons sur ordinateur et petite fenêtre, au-delà du seul aspect des boutons.

## Vérification

Vérifier les garanties utiles : persistance, chemins portables, migrations, reprise d'import, protection de l'API locale et lecture. Un test automatisé Windows ne remplace pas la recette matérielle demandée dans l'issue de sortie du MVP.
