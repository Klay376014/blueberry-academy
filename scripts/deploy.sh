#!/usr/bin/env sh
# Build the app and push the Worker bundle to Cloudflare.
#
#   sh scripts/deploy.sh            # values from apps/web/.env.hosted
#   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_ANON_KEY=… sh scripts/deploy.sh
#
# The two NUXT_PUBLIC_* values are runtime variables of the Worker rather than
# build inputs, which is why they are passed with `--var` here and are absent
# from the build step: docs/adr/0011-nuxt-public-as-worker-runtime-vars.md.
set -eu

env_file=apps/web/.env.hosted
config=apps/web/wrangler.jsonc

read_env() {
  # Read rather than source: the file is data, and this way a stray line in it
  # cannot run.
  #
  # `|| return 0` rather than `[ -f … ] && …`: a false `&&` list makes the
  # function exit 1, and under `set -e` an assignment whose substitution failed
  # takes the script with it -- so a missing file would kill the script before
  # the message that says which file to create.
  [ -f "$env_file" ] || return 0
  sed -n "s/^$1=//p" "$env_file" | tr -d '"' | tail -n1
}

url=${NUXT_PUBLIC_SUPABASE_URL:-$(read_env NUXT_PUBLIC_SUPABASE_URL)}
key=${NUXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env NUXT_PUBLIC_SUPABASE_ANON_KEY)}

# Taken from the config rather than repeated here, so the origin checked is the
# origin deployed to.
origin="https://$(sed -n 's/.*"pattern": "\([^"]*\)".*/\1/p' "$config")"

# A deploy pointing at the local stack is the failure this guards: the site comes
# up, looks fine, and every request goes to a host the browser cannot reach.
case "$url" in
https://*.supabase.co) ;;
*)
  echo "✖ NUXT_PUBLIC_SUPABASE_URL is '$url' — expected the hosted project's https URL." >&2
  echo "  Set it in the environment, or run scripts/setup-hosted-supabase.sh to write $env_file." >&2
  exit 1
  ;;
esac

if [ -z "$key" ]; then
  echo "✖ NUXT_PUBLIC_SUPABASE_ANON_KEY is empty." >&2
  exit 1
fi

echo "→ building"
pnpm run build

echo "→ deploying apps/web/.output, pointed at $url"
pnpm -C apps/web exec wrangler deploy \
  --var "NUXT_PUBLIC_SUPABASE_URL:$url" \
  --var "NUXT_PUBLIC_SUPABASE_ANON_KEY:$key"

# The deploy is not the acceptance: what matters is that the served shell carries
# the hosted URL. A fresh custom domain needs a moment for its route to exist,
# hence the retries.
echo "→ checking $origin serves a shell pointed at $url"
headers=$(mktemp)
body=$(mktemp)
trap 'rm -f "$headers" "$body"' EXIT

status=$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' \
  --retry 5 --retry-all-errors --retry-delay 3 --max-time 20 "$origin/" || echo 000)

# Cloudflare challenged this client rather than serving the site. Bot Fight Mode
# does that to datacenter IPs -- every GitHub runner is one -- and it cannot be
# excepted: it does not run on the Ruleset Engine, so WAF skip rules and Page
# Rules have no effect on it (developers.cloudflare.com/bots, Limitations).
# Measured: six Managed Challenge events from 20.51.198.216, one per retry.
if [ "$status" = 403 ] && grep -qi '^cf-mitigated:' "$headers"; then
  version=$(pnpm -C apps/web exec wrangler deployments status --json | jq -r '.versions[0].version_id')
  deployed=$(pnpm -C apps/web exec wrangler versions view "$version" --json |
    jq -r '.. | objects | select(.name == "NUXT_PUBLIC_SUPABASE_URL") | .text')

  if [ "$deployed" = "$url" ]; then
    echo "⚠ $origin challenged this client, so the served shell went unchecked."
    echo "  Fell back to version $version, whose NUXT_PUBLIC_SUPABASE_URL is $url."
    exit 0
  fi

  echo "✖ version $version carries NUXT_PUBLIC_SUPABASE_URL '$deployed', expected '$url'." >&2
  exit 1
fi

if [ "$status" != 200 ]; then
  echo "✖ $origin answered $status — the upload succeeded, the route is what to look at." >&2
  exit 1
fi

# Says nothing about which deploy answered: an edge still serving the previous
# version passes this too. It catches the standing mistake -- a site pointed at
# the local stack -- not a same-origin regression between two deploys.
if ! grep -qF "$url" "$body"; then
  echo "✖ $origin served a shell without $url — the runtime variables are what to look at." >&2
  exit 1
fi

echo "✔ $origin is live and pointed at $url"
