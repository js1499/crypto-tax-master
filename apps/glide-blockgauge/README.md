# Glide — "Blockgauge" marketing site

Static single-page site, no build step. Serve locally with `python -m http.server 8911 -d apps/glide-blockgauge`
(or `node <eng-site>/scripts/serve.mjs --dir apps/glide-blockgauge --port 8921`) and deploy by copying this
folder to any static host. CTA links (`/register`, `/login`, `/contact`) assume same-domain deployment with
the Glide app. Art direction (won a 5-direction / 3-judge panel): see `DIRECTION.md`. Sibling site: `apps/glide`.
