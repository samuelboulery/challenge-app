# Checklist E2E items (manuel)

Objectif: vérifier que chaque item est utilisable immédiatement ou via un CTA au moment propice.

## Préconditions
- Groupe avec au moins 3 membres.
- Inventaire avec items locaux et globaux (joker, booster, surcharge, gilet pare-balles, au moins un chaos).
- Défis disponibles dans les statuts `proposed`, `negotiating`, `accepted`, `proof_submitted`.

## Cas critiques

1. **Booster global**
   - Acheter un booster global dans le groupe.
   - Ouvrir un défi `proposed` en tant que cible.
   - Accepter avec booster.
   - Attendu: pas d'erreur `Booster invalide`, item consommé, défi avec `booster_inventory_id`.

2. **Joker global en refus/annulation**
   - Forcer la pénalité (>= 3e refus hebdo) dans le groupe.
   - Refuser/annuler un défi avec joker global.
   - Attendu: pénalité à 0, joker consommé, défi annulé.

3. **Surcharge au bon moment**
   - Créer une contestation pour passer en `negotiating` en tant que créateur.
   - Vérifier la présence du CTA `surcharge` uniquement en contestation.
   - Attendu: visible en `negotiating`, non visible en `proposed`, effet appliqué sans erreur contexte.

4. **Gilet pare-balles en `accepted`**
   - En tant que cible sur un défi `accepted`, vérifier le CTA.
   - Attendu: `gilet_pare_balles` visible et activable, points du défi réduits.

5. **Inventaire profil**
   - Vérifier chaque item non utilisé dans `/profile`.
   - Attendu: texte de contexte d’usage affiché + lien `Ouvrir les défis` pour items contextuels.

## Vérifications techniques réalisées dans cette implémentation
- ESLint ciblé sur tous les fichiers modifiés: OK.
- Lints IDE sur fichiers modifiés: OK.
