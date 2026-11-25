# Informations des pages de vente (#10)

Périmètre choisi le 6 novembre 2026 après #100 : BeatStars (liens de prod et `bsta.rs`) et pages `/produit/` de Jake B. Les profils, packs, abonnements, pages privées et autres marketplaces restent exclus de l’enrichissement. Les liens externes explicitement étiquetés Achat/Acheter/Purchase sont reconnus pour la consultation manuelle ; leur présence n’autorise pas un téléchargement arbitraire.

## Fonctionnement

Après publication réussie d’une nouvelle prod, une tâche distincte lit les informations publiques des boutiques reconnues. Elle ne retarde pas la disponibilité du MP3 et ne retélécharge aucun audio. Pour les prods existantes, l’action **Compléter depuis la page de vente**, dans le rail de fiche, lance la recherche ; les résultats restent enregistrés et consultables hors ligne. Actualiser complète aussi les liens de description par une opération locale, en conservant toute correction manuelle, y compris une liste volontairement vide.

Seuls BPM, tonalité et crédit absents, sans correction manuelle, peuvent être complétés automatiquement. Un crédit déjà renseigné et les associations manuelles, même vides, restent prioritaires. Les tags sont des propositions pour le vocabulaire commun ; aucune catégorisation style/ambiance inventée. Une date de boutique est conservée séparément et ne remplace jamais la publication YouTube. Des sources en désaccord restent des propositions distinctes, sans arbitrage silencieux.

La fenêtre affiche valeurs proposées, valeurs actuelles, liens et dates de source. Utiliser la sélection modifie le brouillon ; seul Enregistrer dans la fiche valide. Annuler restaure les valeurs précédentes. Une proposition acceptée est marquée manuelle avec sa provenance et ses crédits structurés : plusieurs producteurs restent plusieurs profils. La validation refuse une proposition obsolète après changement de lien/résultat ; les erreurs conservent le brouillon. Une suppression de tag n’est pas contournée par l’enrichissement.

## Référence visuelle et recette

Relecture des cadres Informations Officiel dans [Paper](https://app.paper.design/file/01M5QR97GBV3NSMTMD9TXHX51N/p-9-0), tokens `9da92004`. Il n’existe pas de maquette spécifique pour cette nouvelle fenêtre : elle réutilise Modal, le rail et les thèmes existants, sans prétendre reproduire un écran absent. Cadre640×600 limité à la fenêtre moins24px, contenu seul défilant, feedback réservé54px, actions fixes ; focus rendu au déclencheur. La fiche garde sa géométrie et l’audio reste monté. À1024px, la recette met d’abord tout le volet Prods visible, selon son défilement horizontal existant, puis compare ses positions entre états.

Tests synthétiques : protections API/HTTP/DNS, redirections et formats, limites et annulation d’une réponse lente, parsing ciblé et identité, champs absents/ambigus, collaborateurs, cache, corrections pendant la recherche, lien modifié, rollback de Save et migration10→11/sauvegarde/déplacement. Navigateur : aperçu, Annuler, Save, réouverture, cache, erreurs/réessai, géométrie1440×900/1024×620, focus et audio/temps/volume. Les recettes de tonalités et profils existantes sont réutilisées. Aucun média ou HTML de boutique réel dans les fixtures.

## Accès et limites observés

Recette publique des seules métadonnées le 6 novembre 2026, sans cookie, compte, clé API ou téléchargement d’audio :

- [Jake B — La vie est belle](https://jakebmusic.com/produit/la-vie-est-belle/) :150 BPM, F minor, publication boutique24 juin2026 et tags dans les blocs HTML dédiés. Le crédit de compositeur n’est pas déduit de l’auteur d’un avis ou du nom de domaine.
- [LACCO — lien fourni](https://bsta.rs/DT867Y) : redirection vers la prod25936218. Le [point de lecture public](https://main.v2.beatstars.com/track?id=25936218) renvoie144 BPM et A# minor, en désaccord avec Ab minor dans la description YouTube fournie ; la valeur existante est conservée.
- [Samoss — lien fourni](https://bsta.rs/MT389A) : prod26191572. Le [point de lecture public](https://main.v2.beatstars.com/track?id=26191572) renvoie130 BPM, E major et publication6 septembre2026 ; la description YouTube fournie disait E minor. Le désaccord et les dates restent distincts.

L’API BeatStars utilisée est un accès public observé, sans contrat de stabilité documenté retenu. Une route v3 exigeant une authentification a été écartée ; aucune tentative de contournement. Les pages principales BeatStars renvoient parfois une coque JavaScript sans données musicales ; l’identifiant exact de `/beat/…` sert alors à lire la route publique ciblée, dont la réponse doit confirmer cet identifiant et le type BEAT. La correspondance avec YouTube repose aussi sur le titre d’origine compatible et un lien de produit : contrôle conservateur, susceptible de refuser un vrai lien si les titres diffèrent. Les recommandations et autres éléments du catalogue ne sont pas parcourus.

L’exemple RoyMadeBeats n’a toujours pas d’URL fournie ; sa recette spécifique n’est pas déclarée effectuée. Un format modifié ou un accès refusé produit une erreur explicite et conserve l’import, la lecture et l’édition manuelle. Le résultat ne garantit pas que les informations publiées par une boutique soient exactes.

## Stockage et sécurité

Migration11 sauvegardée et transactionnelle : `marketplace_enrichments` lie à chaque prod état, empreinte des sources, résultat filtré, dates de requête et erreur sûre. Aucun déplacement de média. Les réponses brutes, scripts, URL de streaming, portraits et clés présentes sur les sites ne sont ni exécutés, ni téléchargés, ni stockés au catalogue. Provenance par champ : URL produit, URL de données et chemin du champ ; acceptations explicites archivées dans la provenance manuelle. Le résultat garde les dates marchandes par source.

HTTP HTTPS uniquement, hôtes **et chemins** limités aux deux adaptateurs et à une route API construite avec l’identifiant numérique. Chaque redirection est revérifiée (4 lectures maximum), proxy ambiant et cookies absents. Toutes les adresses DNS doivent être publiques et unicast ; connexion à l’adresse numérique vérifiée, TLS/SNI vérifiés pour le nom initial. Réponse ≤2 Mio, type HTML/JSON attendu et compression refusée. Connexion/attente socket ≤4s, budget global20s par tâche, fermeture active sur échéance/arrêt ; la résolution DNS dépend du résolveur système. Au plus3 liens par tentative, un seul worker, intervalle d’une minute par prod. Une relance interrompue reste récupérable ; le cache est conservé en cas d’échec. Le moteur demeure sur127.0.0.1 avec session/Origin ; ces règles n’autorisent pas une exposition réseau.

L’écriture relit la prod après les requêtes : corrections manuelles et changement de lien priment sur le résultat tardif. L’import et le lecteur gardent leurs workers/états ; le suivi des imports rafraîchit aussi les cartes quand l’enrichissement différé se termine, sans rouvrir de fiche. Aucun nom physique de MP3 n’est changé après enrichissement : il reste celui établi lors de l’import initial.
