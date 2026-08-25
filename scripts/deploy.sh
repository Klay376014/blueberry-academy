#!/usr/bin/env sh
# Build the app and push the Worker bundle to Cloudflare.
#
#   sh scripts/deploy.sh            # values from apps/web/.env.hosted
#   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_ANON_KEY=… sh scripts/deploy.sh
#
# The two NUXT_PUBLIC_* values are the Worker's runtime variables, not build
# inputs -- `ssr: false` still leaves a Nitro server, and it is that server which
# renders the SPA shell and writes runtimeConfig.public into the payload on every
# request. See docs/adr/0011-nuxt-public-as-worker-runtime-vars.md; measured, not
# assumed. Passing them with `--var` at deploy time keeps one source of truth
# (apps/web/.env.hosted locally, GitHub secrets in CI) and puts neither value in
# a committed file.
#
# Both are public by design: the browser is the only thing that talks to
# Supabase and RLS is what guards the data. The service_role key has no business
# anywhere near this script.
set -eu

env_file=apps/web/.env.hosted

read_env() {
  # Read rather than source: the file is data, and this way a stray line in it
  # cannot run.
  [ -f "$env_file" ] && sed -n "s/^$1=//p" "$env_file" | tr -d '"' | tail -n1
}

url=${NUXT_PUBLIC_SUPABASE_URL:-$(read_env NUXT_PUBLIC_SUPABASE_URL)}
key=${NUXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env NUXT_PUBLIC_SUPABASE_ANON_KEY)}
origin=${DEPLOY_ORIGIN:-https://blueberry-academy.ivy-cudgel.com}

# A deploy pointing at the local stack is the failure this guards: the site
# comes up, looks fine, and every request goes to a host the browser cannot
# reach.
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

# The deploy is not the acceptance: what matters is that the served shell
# carries the hosted URL. A first deploy to a fresh custom domain needs a moment
# for the route to exist, hence the retries.
echo "→ checking $origin serves a shell pointed at $url"
if curl -fsS --retry 10 --retry-all-errors --retry-delay 3 --max-time 60 "$origin/" | grep -qF "$url"; then
  echo "✔ $origin is live and pointed at $url"
else
  echo "✖ $origin did not serve a shell containing $url." >&2
  echo "  The upload succeeded; the route or the runtime variables are what to look at." >&2
  exit 1
fi
