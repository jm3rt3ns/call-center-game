# Deploying to Cloudflare Pages

The game is served at <https://superboss.jackmertens.com> from a Cloudflare
Pages project. `.github/workflows/deploy.yml` uploads a fresh build on every
push to `main`, so once the setup below is done there is nothing to run by
hand.

The blog on the root domain (`jackmertens.com`) is a separate Pages project and
is untouched by any of this - a subdomain is its own custom domain and its own
DNS record.

## One-time setup

### 1. Create the Pages project

The workflow does a *direct upload*, so the project must exist first and must
**not** be connected to a Git repository (a Git-connected project rejects
uploads from CI).

In the Cloudflare dashboard: **Workers & Pages -> Create -> Pages -> Upload
assets**, name it `superboss`, and upload anything to finish creating it - the
first real deploy will replace it. Set the production branch to `main` under
**Settings -> Builds & deployments** if it is not already.

Or from a terminal with [wrangler](https://developers.cloudflare.com/workers/wrangler/):

```
npx wrangler pages project create superboss --production-branch main
```

### 2. Create an API token

**My Profile -> API Tokens -> Create Token -> Create Custom Token** with:

| setting | value |
|---|---|
| Permission | Account -> Cloudflare Pages -> Edit |
| Account resources | Include -> your account |

Copy the token once - Cloudflare will not show it again.

Your account ID is on the right-hand side of the **Workers & Pages** overview,
or in the URL: `dash.cloudflare.com/<account-id>/...`.

### 3. Add the GitHub secrets

In this repo: **Settings -> Secrets and variables -> Actions -> New repository
secret**.

| secret | value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |

### 4. Point the subdomain at the project

Push to `main` (or run the **Deploy** workflow manually) so a production
deployment exists, then in the Pages project: **Custom domains -> Set up a
custom domain -> `superboss.jackmertens.com` -> Activate domain**.

Because `jackmertens.com` already uses Cloudflare DNS, Cloudflare adds the
`superboss` CNAME itself and issues the certificate - usually live within a
minute or two.

## What gets deployed

The workflow copies only what the browser needs into `dist/site`:

- `index.html`, `styles.css`, every top-level `*.js`
- `assets/` (the sprite packs)
- a generated `_headers` file - `no-cache` on the code so a push is picked up
  on the next reload, one hour on `/assets/*`

It then fails the build if `index.html` references a file that did not make it
into the upload, so a missing asset never reaches the live site.

## Changing the project or domain

Both live in `env:` at the top of `.github/workflows/deploy.yml`:

```yaml
env:
  CLOUDFLARE_PROJECT: superboss
  SITE_URL: https://superboss.jackmertens.com
```

`SITE_URL` is only used for the run summary; the domain itself is configured in
the Cloudflare dashboard.

## Troubleshooting

| symptom | cause |
|---|---|
| `Project not found` | Step 1 was skipped, or the name in `CLOUDFLARE_PROJECT` does not match |
| `Authentication error` / 10000 | Token lacks **Cloudflare Pages: Edit**, or `CLOUDFLARE_ACCOUNT_ID` is wrong |
| Deploy succeeds but the domain 404s | The custom domain in step 4 is not attached, or the deploy landed on a preview branch instead of `main` |
| Old art after a deploy | Hard-refresh once; `/assets/*` is cached for an hour |
