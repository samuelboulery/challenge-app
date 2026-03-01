# Matrice de couverture des items

Cette matrice recense, pour chaque item, la couverture sur trois axes:
- Autorisation métier SQL (`use_inventory_item_effect`, `purchase_item`, `decline_with_penalty`, etc.)
- Action serveur (Next.js server actions)
- Option UI disponible dans le contexte pertinent

## Légende
- `OK`: couvert
- `Partiel`: couvert avec conditions spécifiques
- `N/A`: non applicable (ex: item non consommable via UI de défi)

## Vue synthétique

| Item | SQL | Action serveur | UI (moment propice) | Notes |
|---|---|---|---|---|
| `custom` | OK (achat) | OK (`purchaseItem`) | OK (boutique/inventaire) | Item personnalisé, pas d’effet consommable générique |
| `joker` | OK | OK (`declineChallenge`, `getDeclineInfo`) | OK (CTA refus/annulation avec joker) | Support local + global requis |
| `booster` | OK | OK (`acceptChallenge`) | OK (dialog acceptation) | Support local + global requis |
| `voleur` | OK | OK (`purchaseItem` + `use_voleur`) | OK (usage immédiat à l’achat) | Immédiat, pas de CTA manuel post-achat |
| `item_49_3` | OK | OK (`validateOwnProofWith493`) | OK (preuve soumise) | Distribution saisonnière |
| `gilet_pare_balles` | OK | OK (`applyInventoryItemEffect`) | OK (proposed + accepted côté cible) | Doit rester visible en `accepted` |
| `mode_fantome` | OK | OK | OK | Disponible en contexte challenge (bloc défense) |
| `miroir_magique` | OK | OK | OK (`proposed` cible) | Renvoie le défi au créateur |
| `patate_chaude` | OK | OK | OK (`proposed` cible) | Transfert aléatoire de cible |
| `cinquante_cinquante` | OK | OK | OK (`proposed` créateur) | Crée un bundle de défis |
| `menottes` | OK | OK | OK (`proposed` créateur) | Cible requise |
| `surcharge` | OK (`negotiating`) | OK | OK (`negotiating` créateur) | Doit être caché en `proposed` |
| `sniper` | OK (`proposed`) | OK | OK (`proposed` créateur) | Empêche contestation |
| `embargo` | OK | OK | OK (`proposed` créateur) | Cible requise |
| `roulette_russe` | OK | OK | OK (bloc chaos) | Payload titre/description envoyé côté UI |
| `robin_des_bois` | OK | OK | OK (bloc chaos) | Vol leader et redistribution |
| `amnesie` | OK | OK | OK (bloc chaos) | Annule dernier défi actif |
| `mouchard` | OK | OK (`getGroupJokerIntel`) | OK (bloc chaos + lecture intel) | Effet temporaire requis pour intel |
| `assurance` | OK | OK | OK (`proposed` cible + `accepted` cible) | Active protection de pénalité |
| `quitte_ou_double` | OK | OK (`voteQuitteOuDouble`) | OK (cible + validation membres) | Flux en deux étapes |

## Contextes UI attendus

- **Usage immédiat**: `voleur` au moment de l’achat.
- **Contexte défi `proposed` (cible)**: défense et économie (`gilet_pare_balles`, `mode_fantome`, `miroir_magique`, `patate_chaude`, `assurance`, `quitte_ou_double`).
- **Contexte défi `proposed` (créateur)**: attaques (`cinquante_cinquante`, `menottes`, `sniper`, `embargo`).
- **Contexte défi `negotiating` (créateur)**: `surcharge`.
- **Contexte défi `accepted` (cible)**: `gilet_pare_balles`, `assurance`, `quitte_ou_double`.
- **Bloc chaos (contextuel, hors statut strict)**: `roulette_russe`, `robin_des_bois`, `amnesie`, `mouchard`.

## Vérification opérationnelle

Pour considérer l’audit validé:
1. Aucun item disponible ne reste sans chemin d’usage visible.
2. Aucun CTA ne déclenche une erreur SQL de contexte nominal.
3. Les flux `joker` et `booster` fonctionnent pour inventaire local et global.
