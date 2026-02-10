# Godel Git Worktree Setup

This repository is intentionally isolated at:

- `/Users/jasontang/clawd/External/godel` (canonical repo root)

## Layout

- Main worktree: `/Users/jasontang/clawd/External/godel`
- Secondary worktrees: `/Users/jasontang/clawd/worktrees/godel/<branch-name>`

The secondary location keeps project worktrees out of the workspace repo tree
that is used for other projects and avoids nested-repo confusion.

## Commands

Use the manager script from repo root:

```bash
./scripts/worktree-manager.sh list
./scripts/worktree-manager.sh prune
./scripts/worktree-manager.sh add feature-auth main
./scripts/worktree-manager.sh remove feature-auth
```

## Best-Practice Rules

1. Always run git commands from inside `External/godel` or one of its managed worktrees.
2. Keep worktree paths under `/Users/jasontang/clawd/worktrees/godel`.
3. Run `./scripts/worktree-manager.sh prune` after directory moves or cleanup.
4. Do not create godel worktrees inside `clawd/projects/`.
5. Treat `_worktree_recovery/` as quarantine/forensics only.

## Recovery Reference

If worktrees break after path changes:

1. Archive broken worktree directories.
2. Run `git worktree prune --verbose`.
3. Recreate needed worktrees under the managed base path.
