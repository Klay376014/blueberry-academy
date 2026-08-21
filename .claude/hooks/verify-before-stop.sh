#!/usr/bin/env sh
# Stop: the last gate before Claude hands the turn back. Runs the two checks
# nothing else guards — the recursive unit tests and the cross-package
# type-check (`vp staged` only ever sees the staged files of one commit).
#
# Stays silent when the turn touched no code, so conversational turns are free.
set -u

payload=$(cat)
root="${CLAUDE_PROJECT_DIR:-.}"
cd "$root" || exit 0

# Nothing to verify if no source file in the working tree differs from HEAD.
if ! git status --porcelain -- '*.ts' '*.tsx' '*.vue' '*.js' '*.mjs' '*.json' 2>/dev/null | grep -q .; then
  exit 0
fi

out=$(./node_modules/.bin/vp run -r test:unit 2>&1) || failed_tests=1
tc=$(./node_modules/.bin/vp run -r type-check 2>&1) || failed_types=1
[ -z "${failed_tests-}" ] && [ -z "${failed_types-}" ] && exit 0

report=$(printf 'Repo guard failed before stopping.\n\n%s\n%s' \
  "${failed_tests:+=== vp run -r test:unit ===
$out
}" "${failed_types:+=== vp run -r type-check ===
$tc
}")

# Claude already got one blocked stop this turn — report without blocking again,
# so a genuinely stuck failure cannot spin the turn forever.
if [ "$(printf '%s' "$payload" | jq -r '.stop_hook_active // false')" = "true" ]; then
  printf '{"systemMessage":%s}\n' "$(printf '%s' "$report" | jq -Rs .)"
  exit 0
fi

printf '{"decision":"block","reason":%s}\n' "$(printf '%s' "$report" | jq -Rs .)"
