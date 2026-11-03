# Réglages de sécurité du dépôt public

État vérifié par les API GitHub le **3 novembre 2026**, dans [l’issue #110](https://github.com/kylliandelbauche/yt-beat-m/issues/110). L’utilisateur a effectué chaque modification dans GitHub ; l’agent a uniquement guidé les étapes et vérifié leur résultat. Les réglages de facturation sont inchangés.

| Contrôle | État vérifié |
| --- | --- |
| Visibilité | Dépôt public, historique conservé. |
| Branche main | PR obligatoire, administrateurs inclus ; zéro approbation imposée, aucun contrôle de statut obligatoire. Force-push et suppression désactivés. |
| CodeQL | Configuration par défaut, runners standards ; scan initial terminé pour Python, JavaScript/TypeScript et Actions. |
| Correctifs de sécurité Dependabot | Activés, non suspendus. |
| Workflows proposés depuis des forks | Approbation requise pour tous les contributeurs externes : all_external_contributors. |
| Wiki | Désactivé après confirmation de l’utilisateur. |
| Signalement privé | Activé ; utiliser le canal décrit dans [SECURITY.md](../../SECURITY.md). |

## CodeQL et CI applicative

L’utilisateur a autorisé les analyses automatiques CodeQL après explication de leurs déclenchements. Lors de #110, la CI applicative restait manuelle et aucun workflow du dépôt n’avait été modifié. La décision suivante remplace cette restriction pour les tests applicatifs.

### CI automatique — #114

L’utilisateur autorise désormais le workflow CI sur les PR vers main, Dependabot compris, et les push sur main. Le job porte le nom stable **Checks** et utilise ubuntu-latest si aucun runner manuel n’est fourni. Le lancement manuel conserve Ubuntu et Mac ; les permissions minimales et les actions fixées par SHA sont conservées. Cette décision est inscrite dans [AGENTS.md](../../AGENTS.md).

La protection décrite dans le tableau est le relevé de #110, avant ajout d’un contrôle obligatoire. Ordre de mise en place : fusionner la PR de CI, constater une exécution réussie sur main, puis laisser le propriétaire ajouter **Checks** comme contrôle obligatoire dans la protection de main. L’agent guide et vérifie ce dernier réglage en lecture seule. Tant que ce réglage n’est pas vérifié, un succès de CI ne signifie pas que la fusion est bloquée en cas d’échec.

Le [scan initial CodeQL](https://github.com/kylliandelbauche/yt-beat-m/actions/runs/41631523999) s’est terminé sans erreur d’exécution pour les trois catégories. Il a produit **trois signalements initiaux**, dont un classé élevé par l’outil. Leur [triage ultérieur (#112)](codeql-triage.md) les classe comme faux positifs dans le modèle local documenté, avec revue des flux et tests ciblés. Activer un scanner ne constitue pas une validation de sécurité du code. Les détails restent dans l’onglet Security du dépôt ; aucun rapport brut, donnée personnelle ou scénario d’exploitation n’est publié ici.

## Dependabot

[La configuration](../../.github/dependabot.yml), livrée par [#106 / #107](https://github.com/kylliandelbauche/yt-beat-m/pull/107), suit Actions, uv et npm mensuellement : délai de sept jours, un groupe et une PR de versions ouverte par écosystème. Les correctifs de sécurité ne sont pas retardés par ce délai et peuvent générer des PR supplémentaires. Aucune fusion automatique n’a été activée.

Les [options Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown) et les [déclenchements CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types) sont définis par GitHub. Les contrôles ci-dessus décrivent l’état constaté à la date indiquée, pas une garantie qu’il ne changera jamais.
