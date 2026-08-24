#!/usr/bin/env sh
# The AGENTS.md 實作守則. One set of rules, two entry points:
#
#   check-conventions.sh                 the staged content (.vite-hooks/pre-commit)
#   check-conventions.sh <base> <head>   what <head> adds since it left <base> (CI)
#
# The hook is the one place that sees every local edit regardless of whether a
# human, an editor, or an agent's shell made it — but `--no-verify` skips it, and
# the rules below are the kind that must not depend on self-discipline, so CI
# runs the same script over the pull request's diff. The two modes differ only in
# which files are listed and which revision their content is read from; every
# rule body is shared. .claude/hooks/guard-conventions.sh applies the same rules
# earlier still, to Claude's Edit/Write calls only.
set -eu

case $# in
0)
  # Empty rev means `git show ":$f"`, which reads the index — the staged content,
  # which is not necessarily what is on disk.
  rev=''
  hint='Fix the above, or commit with --no-verify if you are certain.'
  changed_files() { git diff --cached --name-only --diff-filter=ACM; }
  ;;
2)
  base=$1
  head=$2
  rev=$head
  hint='Fix the above and push again.'
  # Three dots, not two: what this branch changed since it forked, not
  # everything that has happened on the base branch in the meantime. Somebody
  # else's merge is not this pull request's diff.
  changed_files() { git diff --name-only --diff-filter=ACM "$base...$head"; }
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
