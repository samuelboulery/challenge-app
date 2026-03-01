# Audit UX/UI global - mobile first

## Methodologie
- Revue des parcours principaux: home groupe, challenges (liste + detail), shop, gestion groupe, profil, notifications, navigation.
- Grille d'analyse: gravite, impact utilisateur, frequence, effort.
- Priorisation:
  - P0: bloque l'usage, cree des erreurs, ou freine fortement la conversion.
  - P1: friction importante mais contournable.
  - P2: optimisation de confort et coherence visuelle.

## Home groupe
### Constats
- Densite visuelle elevee sur mobile (sections tres segmentees, cartes d'activite volumineuses).
- Zones tactiles heterogenes selon les composants.
- Hierarchie de l'information parfois trop plate entre "en attente", "classement", "activite".

### Recommandations
- P0: garder la priorite visuelle sur les actions en attente (deja traite).
- P1: limiter les labels secondaires en uppercase et compacter les espaces verticaux.
- P2: ajouter un etat vide plus incitatif avec CTA direct "Lancer un defi".

## Challenges (liste + detail)
### Constats
- Beaucoup de confirmations dans des overlays, difficile avec clavier et scroll sur mobile.
- Les actions de contestation ont une forte charge cognitive (3 choix, progression, votes).
- Le champ points libre favorisait les erreurs de saisie.

### Recommandations
- P0: panel bas mobile pour toutes les confirmations critiques (deja traite).
- P0: points predefinis pour la creation de defi (deja traite).
- P1: grouper les actions de contestation en etapes visuelles (choix -> recap -> confirmation).
- P2: ajouter un micro-guide contextuel pour expliquer "maintenir / contre-proposer / annuler".

## Boutique
### Constats
- Les actions admin (edit/supprimer) etaient compactes et peu confortables en mobile.
- Les formulaires prix/stock n'etaient pas alignes sur les pratiques mobile (clavier numerique guide partout).
- Les confirmations d'achat special pouvaient couper le contexte.

### Recommandations
- P0: uniformiser les cibles tactiles a 48px mini (deja traite via primitives).
- P1: ajouter helper text systematique pour stock et impact de l'achat.
- P2: proposer un filtre rapide "speciaux / custom / en stock".

## Gestion groupe
### Constats
- Parcours critiques (suppression/remise a 0) sensibles aux erreurs.
- Longueur des contenus d'avertissement + champs de confirmation en modal.

### Recommandations
- P0: panels bas avec CTA sticky et messages destructifs clairs (deja traite).
- P1: ajouter recap des consequences sous forme de checklist avant validation finale.
- P1: blocage explicite si nom partiellement saisi (retour instantane).

## Profil
### Constats
- Changement avatar correct mais affordance mobile perfectible.
- Etat de progression upload et feedback pourraient etre plus explicites.

### Recommandations
- P1: feedback upload (progression ou etat "upload en cours").
- P2: proposition de crop simple avant upload.

## Notifications
### Constats
- Bon coverage fonctionnel, mais lisibilite des priorites ameliorable.
- Potentiel manque de regroupement par type/urgence.

### Recommandations
- P1: tri visuel "action requise" vs "information".
- P2: actions rapides in-line (marquer lu, ouvrir defi) plus visibles.

## Navigation mobile
### Constats
- Cohabitation de composants avec tailles interactives differentes.
- Certains controles custom ne garantissaient pas 48px de hit area.

### Recommandations
- P0: standardisation 48px via primitives globales (deja traite).
- P1: verifier systematiquement tous les boutons custom hors primitives.
- P2: ajouter tests visuels "tap target" dans la QA de release.

## Roadmap priorisee
## P0 (immediat, 1 sprint)
- Generaliser panel bas mobile pour tous les anciens dialogs.
- Uniformiser cibles tactiles 48px sur `Button`, `Tabs` et controles critiques.
- Remplacer le champ points libre par des presets.
- Reduire la densite des cartes d'activite home mobile.

## P1 (court terme, 1-2 sprints)
- Refonte progressive du flow contestation (etapes + recap).
- Clarifier les parcours destructifs par checklist et feedback temps reel.
- Ameliorer lisibilite des notifications actionnables.

## P2 (moyen terme, 2+ sprints)
- Personnalisation avancee du profil (crop avatar).
- Filtres/segmentation boutique plus fine.
- Mise en place d'une check-list UX mobile automatisee (design QA).

## KPI de succes proposes
- Temps moyen pour "lancer un defi" (objectif: -20%).
- Taux d'abandon dans les formulaires critiques (objectif: -25%).
- Taux d'erreurs sur actions destructives (objectif: -30%).
- Satisfaction percue mobile (sondage in-app post-action).
