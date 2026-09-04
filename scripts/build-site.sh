#!/usr/bin/env bash
# Stages the deployable site into dist/site - the directory wrangler.jsonc
# uploads. Run by Cloudflare Workers Builds before `wrangler deploy`.
set -euo pipefail
cd "$(dirname "$0")/.."

site=dist/site
rm -rf "$site"
mkdir -p "$site"

# Only the files the browser needs - no README, no workflows, no wrangler config.
cp index.html styles.css ./*.js "$site/"
cp -R assets "$site/"

# The filenames are not content-hashed, so the code must revalidate on every
# load. Sprite frames are effectively immutable once published, but keep their
# TTL short enough that a redraw ships the same day.
cat > "$site/_headers" <<'HEADERS'
/*
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=3600, must-revalidate
HEADERS

# Every asset index.html pulls in must have made it into the upload, so a
# missing file fails the build instead of reaching the live site.
missing=0
refs=$(grep -oE '(src|href)="[^"]+"' "$site/index.html" | sed -E 's/.*"(.*)"/\1/')
for ref in $refs; do
  case "$ref" in
    http*|//*|data:*|\#*) continue ;;
  esac
  if [ ! -f "$site/$ref" ]; then
    echo "error: index.html references $ref, which is not in the upload" >&2
    missing=1
  fi
done
if [ ! -e "$site/assets/sprites/packs.json" ]; then
  echo "error: missing assets/sprites/packs.json" >&2
  missing=1
fi
[ "$missing" -eq 0 ]

echo "Staged $(find "$site" -type f | wc -l) files in $site"
