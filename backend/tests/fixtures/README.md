# Audio de test

`tone.mp3.base64` encode une sinusoïde à 440 Hz d'une seconde, générée avec FFmpeg/libmp3lame pour les tests de lecture et d'indexage. Aucun fichier personnel ni téléchargement YouTube n'est utilisé. Les tests décodent ce contenu dans un dossier temporaire ; FFmpeg n'est pas nécessaire à leur exécution.

Commande de génération : `ffmpeg -f lavfi -i sine=frequency=440:sample_rate=44100 -t 1 -c:a libmp3lame -q:a 9 tone.mp3` puis encodage Base64.
