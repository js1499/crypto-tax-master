# Glide — marketing site ("The Case File")

Static single-page site, no build step. Serve locally with `python -m http.server 8910 -d apps/glide`
(or `node <eng-site>/scripts/serve.mjs --dir apps/glide`) and deploy by copying this folder to any
static host (Vercel/Netlify/S3). CTA links (`/register`, `/login`, `/contact`) assume it's deployed
on the same domain as the Glide app. Art direction: see `DIRECTION.md`.
