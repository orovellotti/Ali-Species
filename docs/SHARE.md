# Share features

## Share this answer (chat reply)

- Bouton **Partager cette réponse** dans le header de chaque tour de chat (`ConversationTurn` dans `ConversationalBar.tsx`). Ouvre `ShareAnswerModal` qui affiche question + réponse tronquée (600 char max) + jusqu'à 5 espèces citées.
- Lien partageable : `${origin}${BASE_URL}?q={encodedQuestion}` — la home page détecte `?q=` au mount, strip le param de l'URL (history.replaceState) et auto-soumet la question via `ask(seed)` pour rejouer la requête côté destinataire.
- Actions modal : Copier le lien / Copier le texte (template LinkedIn) / LinkedIn (`share-offsite`) / X (`twitter.com/intent/tweet`). Templates i18n FR/EN avec `{{question}}`, `{{reply}}`, `{{url}}`. Modal lazy-mounted, ESC ferme + body scroll-lock + aria-modal.

## Share this discovery (viral card)

- Bouton **Partager cette découverte** dans le header de la page taxon (à côté du badge Rang/CD_NOM). Ouvre `ShareDiscoveryModal` avec aperçu live de la carte.
- Composant réutilisable `ShareDiscoveryCard` (`components/ShareDiscoveryCard.tsx`) — 2 formats : **landscape 1200×630** (LinkedIn/X/OG) et **story 1080×1920** (Instagram/TikTok). Fond gradient vert naturel + image espèce + nom scientifique italique + vernaculaire + badge sensibilité (couleur selon score : rose ≥80, ambre ≥50, emerald sinon) + fact auto-généré + CTA "Demandez tout à la nature" + handle alispecies.io. Auto-shrink du titre si nom > 28-30 caractères. Fallback gradient + feuille si pas d'image.
- Fact intelligent dérivé des statuts BdC : CR/EN/VU sur Liste rouge → phrase dédiée ; PN/PR/PD → "espèce protégée" ; DH*/DO* → "directives européennes" ; sinon fallback générique.
- Export PNG via `html-to-image` (`toPng` avec `pixelRatio: 2`, `cacheBust: true`, dimensions explicites). Le canvas n'est pas tainted car les images passent par `/api/image-proxy` (même origine).
- Actions : Télécharger PNG / Copier lien (canonical URL) / Copier texte (template LinkedIn ou X selon contexte) / Partager LinkedIn (popup `share-offsite`) / Partager X (`twitter.com/intent/tweet`). Templates i18n FR/EN avec interpolation `{{url}}`.
- Modal lazy-mounted (`{shareData && <Modal>}`) : la carte 1080×1920 n'est pas dans le DOM tant que l'utilisateur ne clique pas. ESC ferme + body scroll-lock + aria-modal.

## Pages serveur (`/share` + `/api/og`)

- `GET /share/taxon/:cdNom` (servi par api-server, hors `/api`, paths artifact = `["/api","/share"]`) → HTML statique avec balises OG/Twitter complètes + JSON-LD + meta-refresh vers `/taxon/:slug`. Optimisé pour les crawlers LinkedIn/Slack/X qui n'exécutent pas le JS.
- `GET /api/og/taxon/:cdNom.png` → 302 redirect vers la meilleure image Wikimedia du taxon (cache 1h + stale-while-revalidate 24h). Fallback `/og-default.png` si pas d'image.
