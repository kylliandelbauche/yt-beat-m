# Sécurité

Beat m est une application locale en développement. Les correctifs visent la branche `main` ; aucune ancienne version n'est maintenue séparément.

## Signaler un problème

Utiliser [Report a vulnerability](https://github.com/kylliandelbauche/yt-beat-m/security/advisories/new) pour un signalement privé lorsque cette fonction est activée. Si elle est indisponible, ouvrir une issue demandant un canal privé, **sans détail d'exploitation ni donnée sensible**.

Décrire la version ou le commit, le système, le comportement attendu et les étapes minimales de reproduction avec des données fictives. Ne pas joindre de bibliothèque personnelle, cookie, clé API, jeton de session ou journal brut. Anonymiser les chemins locaux.

## Modèle d'utilisation

- Le lanceur écoute uniquement sur `127.0.0.1`. Ne pas l'exposer sur le réseau ni derrière un proxy public.
- Host et Origin sont contrôlés ; les mutations exigent une origine autorisée et un jeton aléatoire propre au processus. Ce mécanisme protège le navigateur contre les sites tiers ; il ne constitue pas un compte utilisateur ni une protection contre un programme malveillant déjà exécuté sur la machine.
- Les fichiers servis sont résolus sous la bibliothèque choisie ; les chemins sortants et liens symboliques internes sont refusés. Ouvrir uniquement des bibliothèques de confiance. Un autre processus disposant des mêmes droits sur le disque reste hors de cette frontière de protection.
- Les descriptions restent du texte, les liens externes sont limités à HTTP(S) et les commandes système utilisent des arguments séparés. Les imports n'acceptent que des liens vidéo YouTube ; les liens de vente ne sont pas récupérés par le moteur.
- yt-dlp, Node et FFmpeg traitent des contenus distants. Garder les dépendances à jour, contrôler les mises à jour et n'importer que les contenus autorisés.

Les fichiers `.env`, bibliothèques, bases, médias, journaux et rapports locaux ne doivent pas être versionnés. Ne jamais placer un secret dans une variable `VITE_*` : elle serait intégrée à l'interface distribuée.

L'[audit de préparation à la publication](docs/security/public-readiness.md) décrit les contrôles et leurs limites ; un scan sans alerte n'est pas une garantie d'absence de vulnérabilité.

Les [réglages de sécurité du dépôt public](docs/security/github-settings.md) et l’exception CodeQL autorisée sont documentés séparément des audits du code.
