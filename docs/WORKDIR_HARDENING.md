# Working Directory Hardening

This project now includes an execution guard to prevent commands from running
outside the canonical Godel project tree.

## What Is Enforced

- `scripts/ensure-project-root.js` fails fast when the current working directory
  is not under this repository root.
- Core npm scripts call `preflight:cwd` before executing.
- Server entrypoints (`start-server.js`, `start-server-dev.ts`) run the same
  guard before startup.

## How to Use

Always run commands from the repository root:

```bash
cd /Users/jasontang/clawd/projects/godel
npm run dev
```

If a command is started from the wrong location, the guard exits with an error
and prints the expected path.

## GA Checklist Additions

Before release operations:

1. Run `pwd` and confirm it is `/Users/jasontang/clawd/projects/godel`.
2. Run `npm run preflight:cwd` and ensure success.
3. Run your normal release checks (`npm run verify:release`).
