# Prototype desktop Tauri — #122

Décision du 25 novembre 2026 : valider le contenant desktop avant de remplacer Python par Rust. React, le catalogue et les médias restent identiques. Ce prototype Mac local n’est pas une version publique signée.

## Construction et usage

Sur Mac : Command Line Tools Apple, Rust/rustup, Python/uv et Node24 pour le développement. `desktop/rust-toolchain.toml`, Cargo.lock, uv.lock et les deux package-lock.json fixent les dépendances. Depuis la racine :

```sh
python3 scripts/desktop.py build
```

Le script compile React, fige le moteur avec PyInstaller puis construit Tauri. Seuls le moteur, ses dépendances, les migrations SQL et le frontend sont copiés, jamais le dépôt complet, les bibliothèques, préférences, journaux ou fichiers `.env`. Python, yt-dlp/EJS et React sont embarqués ; Python, uv, npm et Rust ne sont pas nécessaires pour ouvrir l’application.

Sorties locales ignorées par Git : `desktop/src-tauri/target/release/bundle/macos/Beat m Prototype.app` et le DMG dans `desktop/src-tauri/target/release/bundle/dmg/`. `python3 scripts/desktop.py dev` prépare le même moteur et lance Tauri ; une modification Python demande une nouvelle préparation.

Ouvrir l’application puis Réglages → Bibliothèque pour choisir explicitement une collection. Les préférences desktop sont distinctes (`yt-beat-m-desktop`) ; aucune collection web n’est ouverte silencieusement. Fermer la bibliothèque dans l’autre moteur avant de l’ouvrir ici : le verrou existant refuse deux moteurs concurrents. Les MP3 externes de Mes sons peuvent demander une reconnexion dans le registre propre au prototype ; aucun original n’est déplacé.

## Frontières et cycle de vie

- Le moteur réserve un port éphémère sur127.0.0.1 avant de configurer Host/Origin. Son stdout privé annonce le port après démarrage réel, sans secret ni chemin. Le parent ne s’attache jamais à un serveur existant.
- Les protections Origin/session/CSP et HTTP Range restent identiques. Aucune commande Tauri ni capacité native n’est accordée à l’interface distante. Navigation limitée à l’origine possédée ; nouvelles fenêtres et téléchargements de webview refusés. Seuls les liens HTTP(S) peuvent ouvrir le navigateur système.
- Les options passent sur stdin privé, pas dans l’URL. `BEAT_M_DESKTOP_PREFERENCES` permet une recette isolée ; aucune valeur machine n’est inscrite dans un build publié.
- EOF sur stdin arrête le moteur et ses workers, même après mort du parent. Le parent borne démarrage à30 secondes et arrêt à45 secondes avant dernier recours. Une erreur de démarrage affiche une page fixe, sans chemin privé, avec fermeture/relance.

## Limites explicites

- Mac uniquement ; minimum configuré macOS14, mais une recette sur14 reste nécessaire. Pas d’EXE Windows validé.
- DMG local sans identité Developer ID ni notarisation : pas encore une distribution publique.
- Import YouTube : FFmpeg, ffprobe et Node24 restent nécessaires dans le PATH du processus. Finder ne reprend pas forcément celui du terminal ; Diagnostic fait foi. Leur embarquement avec licences constitue une prochaine tranche ; aucun téléchargement invisible au lancement.
- Rust possède le cycle de vie ; la logique métier reste Python. Aucun gain de mémoire/vitesse n’est promis.
- WebKit navigateur complète la recette native, sans prouver à lui seul WKWebView, l’écoute physique ou le drag-and-drop dans le DAW.

## Vérification reproductible

```sh
python3 scripts/desktop.py prepare
BEAT_M_TEST_ENGINE="$PWD/desktop/src-tauri/resources/engine/beat-m-engine" uv run --locked --group desktop pytest backend/tests/test_desktop.py
cd desktop/src-tauri
cargo fmt --check
cargo clippy --locked -- -D warnings
cargo test --locked
```

Le test vérifie socket réelle, origine/jeton, audio206, édition conservée après redémarrage, arrêt après EOF et MP3 intact. Ces garanties sont répétées avec le binaire figé et un PATH sans Python/Node ; le redispatch yt-dlp est testé hors réseau. Médias synthétiques et préférences temporaires uniquement. Checks reste automatique sur Ubuntu ; le lancement manuel Mac ajoute les vérifications Rust et la construction du paquet.

Recette native à consigner avant livraison : paquet, bibliothèque temporaire, recherche, fiche, lecture/pause/seek/volume, choix de dossier, localisation Finder, fermeture/réouverture et absence de moteur abandonné. Écoute physique et DAW à confirmer par l’utilisateur.

## Références

- [Moteurs web Tauri](https://v2.tauri.app/reference/webview-versions/)
- [Exécutables embarqués](https://v2.tauri.app/develop/sidecar/)
- [Distribution DMG](https://v2.tauri.app/distribute/dmg/)
- [PyInstaller : runtime figé](https://pyinstaller.org/en/stable/runtime-information.html)
