# Prototype Windows x64 — #132

Depuis la racine sur Windows10/11 x64 avec outils de développement Node24, uv et MSVC/Rust : `python scripts/desktop.py build`. L’installation utilise ensuite uniquement le setup NSIS généré dans `desktop/src-tauri/target/release/bundle/nsis`, sans Python/uv/Rust sur le poste cible. Le même script conserve le DMG sur Mac. Les versions desktop0.1.2 incluent #130.

Le moteur Python reste en mode console pour conserver ses vrais canaux privés ; Rust le lance avec CREATE_NO_WINDOW. Son nom et les ressources utilisent le suffixe .exe sous Windows. Le processus de téléchargement utilise également une création sans console. Les sélecteurs de MP3 et JPEG/PNG utilisent un OpenFileDialog Windows, avec annulation et réponse JSON UTF-8 ; les validations et autorisations de fichiers du moteur restent identiques.

L’installateur est par utilisateur. WebView2 est vérifié et le bootstrapper Microsoft le télécharge si nécessaire : Internet peut donc être nécessaire à cette première installation. Les MP3 déjà présents restent consultables hors ligne. FFmpeg, ffprobe et Node restent des prérequis d’import ; Diagnostic indique leur disponibilité. Pas de signature commerciale, pas de version ARM native ni de migration Rust du métier.

Le workflow Windows desktop construit sur un runner standard, teste le moteur figé puis installe le setup dans un dossier temporaire. La recette utilise des médias synthétiques : vraie fenêtre Tauri et processus WebView2, API locale, Range206, favori conservé après redémarrage, moteur enfant terminé à la fermeture et fichier intact. Elle ne constitue pas une écoute physique, ni des clics dans les dialogues de fichiers, ni un essai dans le DAW. L’artefact conserve l’installateur et un rapport avec empreinte et compteurs, sans chemins, préférences ou jetons ; rétention7 jours. Checks reste automatique sur Ubuntu.

Avant transfert d’une bibliothèque : la fermer dans l’autre moteur puis éjecter proprement le disque. Ne pas copier une base ouverte. Les MP3 externes à la bibliothèque doivent être reconnectés sur le nouveau poste. Aucun catalogue ou média personnel n’est inclus dans les tests ou le setup.

OpenTelemetry API est mis à jour au correctif disponible signalé par Dependabot. La dépendance GTK/glib concerne le renderer Linux et n’est pas embarquée dans ces paquets Windows/Mac ; aucune alerte n’est classée automatiquement.

Références : [NSIS et WebView2](https://v2.tauri.app/distribute/windows-installer/), [canaux Python et mode windowed](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html#sys-stdin-sys-stdout-and-sys-stderr-in-noconsole-windowed-applications-windows-only).
