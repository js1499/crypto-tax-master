# Glide — conversion landing page

Static single page, no build step, no JS dependencies (one IntersectionObserver for reveals).
Serve locally with `python -m http.server 8913 -d apps/glide-landing` (or
`node <eng-site>/scripts/serve.mjs --dir apps/glide-landing --port 8923`). Deploy by copying the
folder. CTA links (`/register`, `/login`, `/contact`) assume same-domain deployment with the app.
Purpose: paid-traffic conversion — standard LP anatomy, Concept A copy, free-trial risk reversal.
