# Scans de publication — #86

Le [rapport principal](public-readiness.md) décrit le périmètre et les limites communes. La PR87 est liée à chaque sous-issue ; les contrôles sont traités séquentiellement. L’historique est conservé avec l’accord explicite du propriétaire. Les scans initiaux restent mesurés dans #86 ; chaque sous-issue mesure sa consolidation ou son complément, sans réimputation rétroactive.

## #88 — Secrets

Gitleaks : aucun secret détecté dans l’historique Git accessible ni les corps/commentaires GitHub actualisés. TruffleHog sans validation réseau retrouve seulement deux occurrences de l’URL d’identification fictive d’un test de refus ; elles sont revues et ne constituent pas des identifiants réels. Le contrôle des fichiers suivis et les journaux des 80 runs déjà scannés sont réutilisés. Aucun `.env`, clé privée, base ni média personnel suivi trouvé dans l’inventaire ciblé. Le propriétaire accepte l’adresse d’auteur historique ; aucune réécriture de Git.

Les limites d’accès aux anciennes éditions, caches et clones restent celles du rapport principal. Les rapports bruts ne sont pas publiés et les clés ne sont jamais testées contre un fournisseur.

## #89 — Dépendances

Les rapports pip-audit (40 distributions applicables au Mac, groupes de développement inclus) et npm audit ne signalent aucune vulnérabilité connue. `uv.lock` ne change pas ; la seule modification du lockfile npm est l’identifiant de licence du projet. Les versions auditées sont donc identiques à celles de la préparation #86. Les installations verrouillées et la compilation dans un clone propre déjà réussies sont réutilisées.

OSV-Scanner n’est pas ajouté en doublon pour ce lot. Les avis évoluent et l’absence de vulnérabilité connue ne constitue ni une analyse de code des dépendances ni une garantie contre une compromission de leur distribution. Les variantes de plateformes non applicables au Mac restent hors de cette exécution. Aucun paquet n’est mis à jour sans motif confirmé.

## #90 — Code Python / React / TypeScript

Semgrep CE 1.183.0 exécute 146 règles sur 60 fichiers suivis ciblés (moteur, interface et scripts). Règles locales Python/lang, FastAPI, requests, navigateur/JavaScript, TypeScript et React, à la révision `16b9e6d45f10649f6a531ec4838ed9924372c3bc` du dépôt officiel semgrep-rules. Métriques et vérification de version désactivées ; aucun résultat envoyé à un service cloud. Les règles restent dans le dossier privé, sans être redistribuées sous la licence MIT du projet.

Cinq alertes sont revues :

| Emplacement | Triage |
| --- | --- |
| `cli.py`, ouverture HTTP | URL construite par le lanceur depuis `127.0.0.1` et un port entier validé ; aucun schéma fourni par une description ou le navigateur. |
| `diagnostics.py`, sous-processus | Commandes de diagnostic internes, arguments séparés, sans shell. |
| `directory_picker.py`, sous-processus | Scripts natifs fixes ; aucune interpolation d’entrée du navigateur dans une commande. |
| `import_process.py`, sous-processus | Appels amont relus : commandes et options fixes, URL YouTube canonique, chemins validés, arguments séparés et absence de shell. Le PATH de l’utilisateur fait partie de l’environnement local de confiance. |
| `library.py`, PRAGMA | Numéro de migration interne converti en entier ; aucune chaîne utilisateur interpolée. |

Aucun défaut exploitable confirmé dans ces alertes ; pas de modification de code pour les masquer. La première invocation a refusé une configuration React inexistante et n’a rien scanné ; la configuration a été corrigée avant le résultat ci-dessus.

**Limite réelle de couverture :** le parseur Semgrep signale `int_of_string` sur `beatmakers.py`. Ce module n’est donc pas déclaré intégralement analysé par Semgrep. Sa compilation CPython réussit ; Bandit, sa revue manuelle et les tests beatmaker exécutés dans les 267 contrôles de #86 complètent cette lacune sans prétendre la supprimer. Les cinq alertes ne sont pas cinq failles et un résultat sans alerte sur le reste ne démontre pas l’absence de défaut.

## #91 — Workflows et infrastructure

Zizmor est réexécuté sur le workflow final : aucune alerte en mode hors ligne. La structure YAML confirme un seul déclenchement `workflow_dispatch`, des permissions `contents: read`, trois actions fixées sur des SHA de 40 caractères et `persist-credentials: false` pour le checkout. Les SHA ont été résolus auprès des dépôts amont ; les propositions de mises à jour restent mensuelles. Aucun push, PR, fusion ou scan de ce lot ne lance de CI hébergée.

Ce mode de zizmor ne couvre pas toutes les propriétés distantes. Le projet ne contient pas de Dockerfile, image, Terraform ou infrastructure déployée : les scans Trivy/Checkov/KICS correspondants sont non applicables. L’incident Trivy cité dans le brief a une communication officielle ; aucune version ni action Trivy n’est installée ou exécutée ici. Ces outils ne sont pas nécessaires au passage public de cette application locale.

## #92 — Application en fonctionnement

ZAP 2.17.0 est exécuté nativement sur Java, depuis l’archive Crossplatform du dépôt officiel ; son SHA-256 est comparé au digest publié avant extraction. Le daemon reste sur `127.0.0.1`, avec clé API temporaire et dossier privé. Le mode `-silent` désactive les requêtes spontanées. Docker n’était pas démarré et n’a pas été lancé. L’extension client Firefox a émis une erreur de profil au démarrage : elle n’est pas utilisée pour cette recette, réalisée avec Chromium externe et le proxy passif ; l’API et les règles passives sont opérationnelles.

Sur une instance jetable au catalogue fictif, 13 contrôles et parcours passent : refus de Host/Origin tiers, Sec-Fetch-Site cross-site, mutations sans jeton ou à faux jeton ; fichiers `.env`, `.git/config` et OpenAPI non exposés ; description hostile réellement affichée comme texte sans exécution ; audio Range ; bibliothèque, fiche, liste et profil beatmaker parcourus. La requête à Host hostile est envoyée directement à l’instance locale afin de ne pas laisser un proxy la router ailleurs. Les requêtes de navigateur vers un tiers sont bloquées et aucun spider ou scan actif n’est lancé.

**Couverture passive :** 61 règles activées, 48 messages capturés dont 29 réponses terminées (les autres sont incomplètes/annulées pendant le parcours). La file passive est vide avant collecte. Ce sont les parcours visités et leurs réponses, pas une exploration exhaustive des endpoints d’une SPA. Les garanties de chemin, de migration et de reprise déjà validées dans les tests de #86 sont réutilisées.

| Alerte ZAP | Triage et décision |
| --- | --- |
| CSP `style-src unsafe-inline` — Medium | Point de durcissement réel : les styles intégrés sont permis pour les variables dynamiques et la géométrie de l’interface actuelle. Le code ne rend pas de HTML brut non fiable et les scripts restent limités à la même origine. Aucun exploit confirmé par cette recette ; la permission reste une limite résiduelle explicite, sans supprimer les styles et casser l’interface pour faire disparaître l’alerte. |
| Session Management Response — Informational | Jeton local volontairement fourni par `/api/session` à la même origine. Les refus cross-site et les mutations protégées sont vérifiés. Sa valeur n’est jamais publiée. |
| Modern Web Application — Informational | Indication de couverture SPA, pas une faille. |
| Suspicious Comments, terme `select` — Informational | Faux positif : le scanner prend le `//` d’une URL de namespace W3C dans React pour le début d’un commentaire. Aucun secret ou détail privé confirmé. |

Aucune alerte High ; aucun défaut exploitable confirmé dans le périmètre testé. Il ne s’agit pas d’un test complet ASVS L2, d’un scan actif, d’un audit multiutilisateur ou d’une validation de l’écoute physique. Le moteur personnel et ses médias restent intacts ; l’instance jetable et ZAP sont arrêtés à la fin.

## Choix des références et des outils

Le brief est adapté au projet plutôt qu’exécuté en bloc : [ASVS officiel OWASP](https://owasp.org/www-project-application-security-verification-standard/), règles [Semgrep](https://github.com/semgrep/semgrep-rules) locales avec [métriques désactivées](https://semgrep.dev/docs/metrics), et [ZAP officiel](https://www.zaproxy.org/docs/desktop/cmdline/) en mode passif. Les références de forks dans le brief ne sont pas utilisées comme téléchargements de confiance. [L’incident Trivy](https://github.com/aquasecurity/trivy/discussions/10425) confirme l’intérêt des SHA et permissions minimales, sans justifier l’installation d’un scanner d’images sur un projet sans image. OSV, Nuclei, CodeQL et les scanners IaC ne sont pas ajoutés en doublon ou sans surface adaptée ; aucune conformité globale ni sécurité absolue n’est revendiquée.
