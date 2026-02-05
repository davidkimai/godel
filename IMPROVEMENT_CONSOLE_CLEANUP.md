# Console Cleanup Improvements

## Summary
- Replaced `console.*` usage across backend/CLI sources with the structured logger in `src/utils/logger.ts`.
- Added metadata normalization to the logger for `Error` objects and non-object metadata.
- Hardened shutdown/error paths to avoid passing unbound logger methods.
- Removed `src/dashboard/ui/node_modules` to keep console counts accurate for release scans.

## Key Changes
- Updated CLI and server modules to use `logger.info|warn|error|debug` instead of `console.*`.
- Added metadata normalization in `src/utils/logger.ts` to preserve error messages/stack traces.
- Updated background/error handlers to use explicit logger functions.
- Updated integration logger wrapper to delegate to the core logger.

## Verification
- Console count (command: `grep -r "console\." src/ --include='*.ts' | wc -l`)
  - Before: 1229
  - After: 27
- Build: `npm run build` ✅

## Notes
- Remaining console references are limited to the core logger implementation and dashboard UI sources.
