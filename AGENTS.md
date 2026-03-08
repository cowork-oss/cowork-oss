# AGENTS.md

## Failure Triage

When a user reports a failure, error, or unexpected behavior:

1. Check development logs first, if available.
2. Read `logs/dev-latest.log` for the most recent captured run.
3. If needed, inspect the newest timestamped file in `logs/dev-*.log` for full context.
4. Quote relevant error lines with timestamps when summarizing findings.
5. If logs are missing, state that clearly and continue with other diagnostics.

## Dev Log Availability

- Log capture is controlled by **Settings -> Appearance -> Developer logging** (default off).
- A forced capture run can be started with `npm run dev:log`.
- Optional local toggle state may exist at `.cowork/dev-log-settings.json`.

## Dev Startup Commands

- Use `npm run dev` for normal development startup; it routes through the log-aware wrapper.
- Use `npm run dev:start` only when you explicitly need the raw underlying startup command.
- Use `npm run dev:log` to force timestamped capture to `logs/dev-*.log` and `logs/dev-latest.log`.
- Avoid using `npm run dev:react` alone for desktop debugging; it skips Electron preload APIs and can produce misleading behavior.
