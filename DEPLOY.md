# Deploying to Cloudflare

The game is served at <https://superboss.jackmertens.com> by a Cloudflare
Worker with static assets, built straight from this repo by **Workers Builds**
on every push to `main`.

The blog on the root domain (`jackmertens.com`) is a separate project and is
untouched by any of this - a subdomain is its own custom domain and its own DNS
record.

## Build and deploy commands

In the Cloudflare dashboard, when you connect this repo (**Workers & Pages ->
Create -> Import a repository**):

| field | value |
|---|---|
| Build command | `bash scripts/build-site.sh` |
| Deploy command | `npx wrangler deploy` (the default) |
| Branch | `main` |

The deploy command is the default one - leave it alone. The build command is
the only thing to fill in: `scripts/build-site.sh` stages `dist/site` with just
the files the browser needs, which is the directory `wrangler.jsonc` uploads.

Leaving the build command blank will *not* work - `dist/site` would not exist
and the deploy fails with a missing assets directory.

## What gets deployed

`scripts/build-site.sh` copies into `dist/site`:

- `index.html`, `styles.css`, every top-level `*.js`
- `assets/` (the sprite packs)
- a generated `_headers` file - `no-cache` on the code so a push is picked up
  on the next reload, one hour on `/assets/*`

It then fails the build if `index.html` references a file that did not make it
into the upload, so a missing asset never reaches the live site.

Everything else - `README.md`, `DEPLOY.md`, `.github/`, `wrangler.jsonc` - stays
out of the upload.

## Pointing the subdomain at it

After the first successful deploy: **the Worker -> Settings -> Domains & Routes
-> Add -> Custom domain -> `superboss.jackmertens.com`**.

Because `jackmertens.com` already uses Cloudflare DNS, Cloudflare adds the
`superboss` record itself and issues the certificate - usually live within a
minute or two. Until then the Worker is reachable at its
`superboss.<your-subdomain>.workers.dev` URL.

## Deploying by hand

```
npm install -g wrangler   # or use npx
wrangler login
bash scripts/build-site.sh
wrangler deploy
```

`wrangler deploy --dry-run` builds and validates without uploading.

## Changing the project name

It is the `name` field in `wrangler.jsonc`. Renaming it creates a *new* Worker
on the next deploy, so the custom domain has to be moved over to it.

## Troubleshooting

| symptom | cause |
|---|---|
| `The directory specified by the "assets.directory" field does not exist` | The build command is blank or failed - it must run `bash scripts/build-site.sh` |
| Build fails with `index.html references ...` | A file `index.html` links to is missing from the repo |
| Deploy succeeds but the domain 404s | The custom domain is not attached yet; check the `workers.dev` URL first |
| Old art after a deploy | Hard-refresh once; `/assets/*` is cached for an hour |
