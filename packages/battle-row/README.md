# battle-row

The `ParsedBattle` → `battles` row mapping, and nothing else.

Its own package because it has two callers that must never disagree: the
browser writes rows at import time (`apps/web`), and `scripts/reparse.ts`
rewrites them from the stored raw log. A copy in each would drift, and the
symptom would be statistics that changed for no reason anybody could name.

Pure, like the parser, and for the same reason — but it is not _in_ the parser:
this is where the database's column names live, and the parser is not allowed
to know them (`CONTEXT.md`, `docs/specs/…§5`).
