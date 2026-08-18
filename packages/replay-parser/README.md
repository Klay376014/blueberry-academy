# replay-parser

Parses Showdown replay logs into a perspective-neutral `ParsedBattle`.

This package must stay a pure function: **no Supabase, no Nuxt, no `fetch`, no I/O of
any kind**, and an empty `dependencies` list. Its testability rests entirely on that.

Scaffolded empty by #1; the parser itself lands in #4.
