#!/usr/bin/env sh
# PostToolUse(Edit|Write): format + lint the file Claude just touched.
# AGENTS.md review checklist: "Run `vp check` ... to format, lint, type check".
# `vp` is not global in this repo — it lives in node_modules/.bin.
set -u
root="${CLAUDE_PROJECT_DIR:-.}"
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$f" ] || exit 0
case "$f" in
  *.ts | *.tsx | *.vue | *.js | *.mjs | *.json) ;;
  *) exit 0 ;;
esac
cd "$root" || exit 0
exec ./node_modules/.bin/vp check --fix --no-error-on-unmatched-pattern "$f"
