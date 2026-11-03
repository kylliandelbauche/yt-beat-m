# Triage du scan CodeQL initial

Revue du **3 novembre 2026**, [issue #112](https://github.com/kylliandelbauche/yt-beat-m/issues/112), sur le code de production du commit `4c15d359ad96fb54e3698544d6f3dbcf6d0c0e72`. Les trois flux SARIF ont été lus, les appels concernés examinés et les garanties vérifiées sur des bibliothèques temporaires. Aucun fichier personnel ni rapport brut n’est publié.

## Résultat

| Signalement | Classement | Justification |
| --- | --- | --- |
| 1 — py/path-injection | Faux positif dans le modèle local documenté | Le chemin est la racine de bibliothèque explicitement choisie par l’utilisateur autorisé, une capacité nécessaire pour les disques et dossiers externes. Le constructeur de chemin ne lit aucun média ; les fichiers internes sont ensuite confinés sous cette racine. |
| 2 — py/stack-trace-exposure | Faux positif | Le statut intercepte uniquement LibraryError, une erreur métier destinée à l’affichage. Les erreurs techniques de catalogue et de manifeste sont converties en messages fixes avant ce retour. |
| 3 — py/stack-trace-exposure | Faux positif | Même fonction de statut, appelée après fermeture : la bibliothèque et l’erreur mémorisée sont effacées. La réponse ne contient plus d’erreur. |

Aucune vulnérabilité confirmée sur ces trois flux ; aucune modification du code de production nécessaire. Le classement des alertes est individuel et justifié ; aucune règle, analyse ou protection GitHub n’est désactivée.

## Garanties vérifiées

- Le POST de sélection exige un Host et une Origin autorisés ainsi que le jeton de session courant. Les demandes non autorisées sont rejetées avant création du dossier ou des préférences. Un chemin relatif est refusé ; une racine absolue choisie hors du dossier des préférences reste utilisable et réouvrable sous la même identité.
- Les médias ne sont pas servis depuis un chemin libre reçu dans la requête : l’identifiant est résolu dans le catalogue, puis safe_path refuse les chemins sortants et les liens symboliques internes. Les tests existants couvrent lecture audio, pochette et localisation sur des entrées de catalogue altérées.
- Des erreurs SQLite et système contenant des détails internes fictifs ont été injectées au niveau de la connexion au catalogue. Une autre vérification altère le manifeste de test. Le statut retourne uniquement le message prévu, sans chemin, instruction SQL ni trace. Fermer réinitialise ensuite le statut.

Les nouveaux contrôles sont dans [test_codeql_triage.py](../../backend/tests/test_codeql_triage.py). Les garanties existantes sont dans [test_app.py](../../backend/tests/test_app.py), [test_library.py](../../backend/tests/test_library.py) et [test_local_audio.py](../../backend/tests/test_local_audio.py). Tous utilisent des données synthétiques ; aucune bibliothèque courante n’est ouverte.

## Portée et limites

Ces conclusions s’appliquent au moteur local et à sa frontière de confiance décrite dans [SECURITY.md](../../SECURITY.md). Elles ne couvrent pas un serveur exposé sur Internet ni un programme malveillant disposant déjà des droits du compte local. Autoriser la sélection de sa bibliothèque ne doit pas être remplacé par une restriction arbitraire à un dossier fixe.

Un changement des protections d’origine/session, du confinement des médias ou de la conversion des erreurs demande de réexaminer ces classements. Ce triage n’est pas un audit exhaustif de l’application. Les alertes restent consultables dans l’historique de sécurité de GitHub après classement.

Références : [règle de chemin CodeQL](https://codeql.github.com/codeql-query-help/python/py-path-injection/) et [règle d’exposition d’exception](https://codeql.github.com/codeql-query-help/python/py-stack-trace-exposure/).
