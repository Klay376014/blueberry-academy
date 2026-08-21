#!/usr/bin/env sh
# PreToolUse(Edit|Write|MultiEdit): enforce the AGENTS.md 實作守則 mechanically.
#
# Only the rules that can be checked from the incoming text live here. The git
# pre-commit hook re-checks the same rules on staged content, which is what
# actually catches edits made through Bash (sed, heredocs) rather than Edit/Write.
set -u

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0

# Everything Claude is trying to introduce: Write content, Edit new_string,
# MultiEdit new_strings. Never old_string — removing a violation is fine.
added=$(printf '%s' "$payload" | jq -r '
  [ .tool_input.content?, .tool_input.new_string?, (.tool_input.edits? // [])[]?.new_string ]
  | map(select(. != null)) | join("\n")')

rel=${file#"${CLAUDE_PROJECT_DIR:-}"/}

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' \
    "$(printf '%s' "$1" | jq -Rs .)"
  exit 0
}

# service_role belongs to scripts/, never to the browser app. Matches key-like
# forms only, so prose asserting the rule ("No service_role key ever enters")
# stays editable.
case "$rel" in
apps/web/*)
  if printf '%s' "$added" | grep -Eq 'SERVICE_ROLE|serviceRole|service_role_key|sb_secret_'; then
    deny "AGENTS.md: the service_role key must never appear in apps/web/ — it belongs to scripts/. The browser signs in with the user's own JWT and the anon key; RLS does the rest."
  fi
  ;;
esac

# replay-parser stays a pure-function package: its testability rests on having
# no I/O or framework dependencies. devDependencies (test tooling) are fine.
case "$rel" in
packages/replay-parser/package.json)
  if printf '%s' "$added" | grep -q '"dependencies"'; then
    deny 'AGENTS.md: do not add runtime dependencies to packages/replay-parser — no I/O, no framework. Its testability rests entirely on being pure functions. If a dependency is genuinely needed, raise it and update the design doc first.'
  fi
  ;;
esac

# A failing snapshot means either the implementation or the expectation is
# wrong. Deciding which is a human call, not a way to make tests green.
case "$rel" in
packages/replay-parser/test/__snapshots__/* | packages/replay-parser/test/fixtures/*)
  deny "AGENTS.md: do not edit a fixture's expected snapshot to make tests pass — first establish whether the implementation or the expectation is wrong. If the expectation really is wrong, say so and change it deliberately, outside this hook."
  ;;
esac

exit 0
