#!/usr/bin/env sh
# The AGENTS.md 實作守則, in two modes:
#
#   check-conventions.sh                 the staged content (.vite-hooks/pre-commit)
#   check-conventions.sh <base> <head>   what <head> adds since it left <base> (CI)
#
# CI runs it too because `--no-verify` skips the hook, and a leaked service_role
# key is not an outcome to leave to self-discipline. Only the file list and the
# revision content is read from differ; the rules below are shared.
# .claude/hooks/guard-conventions.sh applies them earlier, to Claude's
# Edit/Write calls only.
set -eu

case $# in
0)
  # Empty rev means `git show ":$f"` — the index, not what is on disk.
  rev=''
  hint='Fix the above, or commit with --no-verify if you are certain.'
  changed_files() { git diff --cached --name-only --diff-filter=ACMR; }
  adr_files() { git ls-files ':(top)docs/adr/*.md'; }
  ;;
2)
  base=$1
  head=$2
  rev=$head
  hint='Fix the above and push again.'
  # Three dots, not two: somebody else's merge is not this branch's diff.
  changed_files() { git diff --name-only --diff-filter=ACMR "$base...$head"; }
  adr_files() { git ls-tree -r --name-only "$head" -- ':(top)docs/adr'; }
  ;;
*)
  echo "usage: check-conventions.sh [<base-ref> <head-ref>]" >&2
  exit 2
  ;;
esac

violations=$(mktemp)
warnings=$(mktemp)
trap 'rm -f "$violations" "$warnings"' EXIT

# Read line by line rather than word-split, so a path containing spaces stays
# one entry. The loop body runs in a subshell (it is on the right of a pipe), so
# findings go to files rather than to a variable.
# `R` is in the filter as well as `ACM`: a rename is how an ADR gets renumbered
# onto a taken number, and `--name-only` reports a rename by its destination, so
# every rule below still reads the path the content now lives at.
changed_files | while IFS= read -r f; do
  case "$f" in
  apps/web/*)
    # service_role belongs to scripts/, never to the browser app. Key-like forms
    # only, so prose asserting the rule stays writable.
    if git show "$rev:$f" | grep -nE 'SERVICE_ROLE|serviceRole|service_role_key|sb_secret_' >/dev/null; then
      echo "✖ $f: the service_role key must never appear in apps/web/ — it belongs to scripts/." >>"$violations"
    fi
    ;;
  esac

  case "$f" in
  apps/web/*)
    # The maintenance scripts are not deployed, and the app must not be the
    # thing that drags them into a bundle.
    if git show "$rev:$f" | grep -nE "from '[^']*maintenance-scripts|from '[^']*\.\./scripts/" >/dev/null; then
      echo "✖ $f: apps/web/ must not import from scripts/ — those are local maintenance scripts and are never deployed." >>"$violations"
    fi
    ;;
  esac

  case "$f" in
  docs/adr/[0-9][0-9][0-9][0-9]-*.md)
    # docs/adr/README.md: 編號遞增不重用. The number is how the rest of the repo
    # refers to a decision -- a bare "ADR-NNNN" in prose has no link to
    # disambiguate -- so two files sharing one makes every such reference
    # ambiguous. Counted over the whole directory at this revision, because the
    # collision is only visible next to the file that was already there —
    # `:(top)` on that listing so it says the same thing from a subdirectory.
    number=$(basename "$f" | cut -c1-4)
    if [ "$(adr_files | sed 's|.*/||' | grep -c "^$number-")" -gt 1 ]; then
      echo "✖ $f: ADR number $number is already taken — docs/adr/ numbers increase and are never reused." >>"$violations"
    fi
    ;;
  esac

  case "$f" in
  packages/replay-parser/package.json)
    # Pure functions only: no I/O, no framework. devDependencies are fine.
    if git show "$rev:$f" | jq -e '.dependencies // empty' >/dev/null 2>&1; then
      echo "✖ $f: packages/replay-parser must not declare runtime dependencies — its testability rests on being pure functions." >>"$violations"
    fi
    ;;
  esac

  case "$f" in
  packages/replay-parser/test/__snapshots__/* | packages/replay-parser/test/fixtures/*)
    # Not fatal: updating an expectation is sometimes the right call. But it
    # should be a decision, not a way to make a red test green.
    echo "⚠ $f: an expected snapshot changed. Confirm the expectation was wrong, not the implementation." >>"$warnings"
    ;;
  esac
done

# Written as an `if`, not `test && cat`: under `set -e` a failing `&&` list
# would exit the script when there is simply nothing to warn about.
if [ -s "$warnings" ]; then
  cat "$warnings" >&2
fi

if [ -s "$violations" ]; then
  cat "$violations" >&2
  echo "" >&2
  echo "AGENTS.md 實作守則 violated. $hint" >&2
  exit 1
fi

exit 0
