# core.hooksPath is a single absolute path into the main checkout, shared by
# every worktree (git 2.51), so `_/h` derives its PATH from the main checkout
# and runs us from there too. Left alone, a hook run inside a worktree takes
# `vp` from the main checkout's node_modules while `vitest` resolves from the
# worktree, and the two vite-plus test runtimes in one process throw
# "Cannot read properties of undefined (reading 'config')" at every describe().
# `--show-toplevel` is the working tree the commit or push is actually about;
# in the main checkout this line is a no-op. See issue #187.
export PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
