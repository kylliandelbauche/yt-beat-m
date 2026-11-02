# Préparation à la publication — 2 novembre 2026 (#86)

Audit du code courant et de l'historique accessible du dépôt, avant changement de visibilité. Il s'agit d'une revue ciblée de préparation, pas d'un pentest ni d'une certification de sécurité.

## Méthode et outils

[Trail of Bits — open-sourcing](https://github.com/trailofbits/skills/tree/main/plugins/open-sourcing/skills/open-sourcing) fournit la méthode : examiner les secrets avant publication, puis l'historique, les contenus GitHub, la licence et la documentation. Le skill find-skills a servi à explorer les outils ; aucun skill distant n'a été installé globalement. Les scripts indicatifs ont été lus avant exécution. Les règles locales priment : pas de CI automatique, de nouveau packaging public ou de fonctionnalité produit ajouté par cette préparation.

Outils exécutés localement : [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks), [TruffleHog 3.99.7](https://github.com/trufflesecurity/trufflehog) sans validation réseau des candidats, [Bandit](https://github.com/PyCQA/bandit), [pip-audit 2.10.1](https://github.com/pypa/pip-audit), npm audit et [zizmor](https://docs.zizmor.sh/) en mode hors ligne. Les services d'avis de vulnérabilité reçoivent les noms/versions des dépendances, pas le code ni les rapports de secrets. Les résultats bruts restent exclus de Git.

## Couverture et résultats

| Périmètre | Résultat |
| --- | --- |
| Fichiers suivis et historique Git | Gitleaks : aucune détection. Toutes les branches distantes et têtes de PR récupérées ; 100 commits accessibles au relevé initial, y compris les commits avant squash. |
| Noms de fichiers historiques | Aucun `.env`, clé privée, base, journal ou média audio/vidéo sensible trouvé dans l'inventaire ciblé. Les fixtures audio sont synthétiques, encodées en base64 et documentées. |
| Deuxième scan historique | TruffleHog : deux occurrences de la même URL volontairement invalide `user:pass@example.org`, dans un test de refus de lien authentifié. Aucun identifiant réel confirmé. |
| GitHub | 86 issues/PR et 61 commentaires courants récupérés, plus commentaires de revue/revues accessibles : aucune détection de secret dans leur contenu public potentiel. |
| Actions | Les journaux des 80 exécutions disponibles ont été récupérés et scannés : aucune détection. Les chemins supplémentaires examinés appartiennent aux runners de test, pas à la bibliothèque de l'utilisateur. Aucun artefact ni release au relevé. Aucun wiki accessible. |
| Dépendances Python | pip-audit sur l'export verrouillé incluant les dépendances de développement : 40 distributions applicables à ce Mac, aucune vulnérabilité connue signalée. Les variantes conditionnelles pour les autres plateformes n'ont pas été auditées dans cette exécution. |
| Dépendances frontend | npm audit : aucune vulnérabilité connue signalée dans l'arbre verrouillé. |
| Code Python | 27 alertes Bandit examinées : constructions SQL avec valeurs paramétrées et identifiants/opérateurs sur listes fixes, sous-processus sans shell, vérification HTTP locale à URL construite. Aucun défaut exploitable confirmé par cette revue. |
| Interface | Recherche des points d'injection et requêtes : aucun HTML brut injecté ; liens filtrés, API relative locale, aucune clé API ou variable Vite contenant un secret trouvée. |
| Captures | Captures existantes examinées ; nouvelles captures sur une collection fictive, avec pochettes originales et audio synthétique. Aucun média personnel ajouté. |

Une détection supplémentaire dans l'export administratif authentifié de l'API GitHub correspond au champ temporaire de clonage fourni par GitHub. Cet export est privé, ignoré et ne fait pas partie du code, des issues ou des journaux destinés à être publics. Sa valeur n'est jamais publiée.

## Frontières de sécurité examinées

- Écoute forcée sur boucle locale, vérifications Host/Origin/Sec-Fetch-Site, jeton aléatoire comparé en temps constant pour les mutations, absence de CORS permissif et politique CSP.
- Chemins relatifs sous la bibliothèque, refus des traversées et liens symboliques ; résolution des médias par UUID.
- Requêtes SQL paramétrées, champs et tris contrôlés avant interpolation ; migrations sauvegardées et transactionnelles.
- URL vidéo YouTube canonique, options yt-dlp fixes ignorant les configurations et plugins utilisateur ; sous-processus sans shell avec délais et annulation.
- Portraits limités aux domaines HTTPS YouTube autorisés, redirections revérifiées, taille et format bornés ; aucun téléchargement de liens marchands.
- Descriptions rendues comme texte ; liens HTTP(S) sans identifiants ; conservation de la protection de l'API locale existante.

Ce moteur n'isole pas un programme malveillant exécuté avec les mêmes droits sur la machine, ni une bibliothèque modifiée simultanément par un autre processus. Il n'est pas destiné à être exposé comme service réseau multiutilisateur. Voir [SECURITY.md](../../SECURITY.md).

## Changements de préparation

- README raccourci, trois captures de l'application et guide détaillé séparé.
- Licence MIT choisie explicitement par le propriétaire ; métadonnées Python et frontend alignées. Notices des polices conservées.
- Politique de signalement et modèle de sécurité documentés.
- Exclusions supplémentaires des clés privées et réglages de registres locaux.
- Actions tierces fixées sur leurs SHA résolus auprès des dépôts amont ; le checkout ne conserve plus les identifiants. Mises à jour des actions proposées mensuellement par Dependabot, sans déclencher de CI.
- La CI reste manuelle et en lecture seule. zizmor ne signale aucune alerte dans le mode hors ligne exécuté ; ce mode ne vérifie pas toutes les propriétés distantes.

## Publication et limites

L'historique inclut une ancienne adresse d'auteur non anonymisée. Ce point de confidentialité est signalé au propriétaire avant publication ; aucune réécriture ni suppression d'historique n'est effectuée sans décision. Les dates, compteurs agrégés et identités GitHub déjà inclus dans l'historique restent également consultables si ce dépôt devient public.

Les scans ne prouvent pas l'absence de secrets inconnus ou de vulnérabilités. Les détecteurs ne lisent pas le texte contenu dans les pixels ; les captures courantes ont donc aussi été examinées visuellement. Les éditions antérieures de corps d'issues/commentaires, objets Git devenus inaccessibles, caches et clones tiers ne sont pas exhaustivement vérifiables avec ces interfaces. Aucune donnée confidentielle connue n'a été trouvée dans les contenus examinés.

Les protections GitHub de secrets, les alertes de dépendances et le signalement privé doivent être vérifiés après passage public. Aucun changement de facturation, CI hébergée, publication de package ni release automatique n'est effectué. Les tags de version, site de documentation et code de conduite sont différés ; la liste indicative du skill ne bloque pas ce prototype (sa détection de tests ne reconnaît pas le préfixe `test_` du projet).

## Reproduire les contrôles

Installer les outils depuis leurs sources officielles, puis lancer localement, en conservant les rapports hors Git :

```sh
gitleaks git . --log-opts="--all --full-history" --redact=100
trufflehog git file://"$PWD" --no-verification --no-update
uvx bandit -r backend/yt_beat_m
uv export --frozen --no-hashes --no-emit-project --output-file .local/requirements-audit.txt
uvx pip-audit -r .local/requirements-audit.txt --no-deps --disable-pip
npm --prefix frontend audit
uvx zizmor .github/workflows/ci.yml
```

Récupérer au préalable les références Git distantes utiles ; ces commandes seules ne couvrent pas les issues, commentaires et journaux GitHub. Ne pas publier leurs sorties brutes. Refaire l'audit sur des changements de dépendances ou de frontières de confiance, pas seulement à chaque changement visuel.
