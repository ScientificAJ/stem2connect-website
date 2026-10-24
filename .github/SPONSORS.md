# Hackathon sponsors

Edit the sponsor cards inside `#sponsor-rail` in `hackathon/index.html`.
The same source feeds the main site's hackathon route and the hackathon subdomain.

To add a sponsor:

1. Copy one entire `.sponsor-feature` article inside the rail.
2. Give its heading a unique ID and update the article's `aria-labelledby` to match.
3. Update the logo, its alt text, website URL, link's accessible name, sponsor type,
   short headline, description, and contribution. Store logos in `assets/sponsors/`.
4. Set `--sponsor-brand-bg` and `--sponsor-brand-ink` on the article to the brand's
   approved background and contrasting text colors. Keep the supplied logo intact.
5. Replace or omit the `.sponsor-domain-study` and `.sponsor-domain-grid` artwork
   for sponsors whose contribution is not domains. Update the contribution's
   accessible label too; do not carry over .xyz's domain count to another sponsor.

Keep headlines to one short sentence and descriptions to about 15 words.
The rail automatically stays in one horizontal row, reveals previous/next controls
when needed, and supports touch swiping and keyboard navigation. It never auto-rotates.
With one sponsor, that card fills the width and the browsing controls stay hidden.

Only publish confirmed sponsorship claims. Keep domain redemption codes and
private claim links out of the website and repository.
