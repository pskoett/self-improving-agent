---
name: self-improvement
description: "Injects self-improvement reminder at bootstrap and sweeps ended sessions for errors"
metadata: {"openclaw":{"emoji":"🧠","events":["agent:bootstrap","command:new","command:reset"]}}
---

# Self-Improvement Hook

Injects a reminder to evaluate learnings during agent bootstrap, and detects
errors from ended sessions.

This integration uses internal `HOOK.md` events, which have no per-tool-call
callback. OpenClaw's typed plugin hooks expose `after_tool_call`; this hook
retains session-end detection. See the separate
[plugin hook catalog](https://docs.openclaw.ai/plugins/hooks/reference).

## What It Does

**On `agent:bootstrap`** (before workspace files are injected):

- Adds a reminder block to check `.learnings/` for relevant entries
- Prompts the agent to log corrections, errors, and discoveries
- Reminds the agent to maintain relevant/due claims before reuse/promotion,
  using cause-specific checks and actual dated evidence (including one-off
  and unpromoted learnings); it does not perform or enforce revalidation
- If auto-detected errors are awaiting triage, includes a pending-triage note

**On `command:new` / `command:reset`** (session end):

- Locates the transcript of the session that just ended
  (`context.previousSessionEntry`, or `sessionEntry` when no previous entry
  is supplied). Explicit JSONL paths remain supported; SQLite markers use
  OpenClaw's transcript reader. Markerless contexts prefer an existing
  `<workspace>/sessions/<sessionId>.jsonl`, otherwise use the exact
  agent/session identity with the runtime. Only one source is scanned.
- Scans it against a fixed error-pattern list
  (`Error:`, `command not found`, `Traceback`, `npm ERR!`, …)
- Appends a `pending` entry to `<workspace>/.learnings/ERRORS.md` with short,
  truncated, redacted excerpts (max 5 per sweep) for the next session to triage
- Stamps each entry with deterministic `Pattern-Key` values derived from the
  matched pattern (e.g. `deps.module-not-found`, `shell.command-not-found`),
  so auto-detected errors can be deduplicated and recurrence-counted by key
  (see the Pattern-Key Taxonomy in `SKILL.md`)
- Initializes Maintenance as unknown/pending; regex matches cannot classify
  unrelated claims or validate fixes. Triage preserves the original sweep
  and counts only confirmed new occurrences, never reviews.

Capture and maintenance work without this hook or any companion skill.

## Transcript Compatibility

SQLite capture, including compressed events, is tested with OpenClaw
2026.10.4 on Linux/Node 26. The hook lazily resolves
`openclaw/plugin-sdk/session-transcript-runtime` from the running OpenClaw
entrypoint, not from the copied hook directory. OpenClaw classifies this
export as a private host API; future versions and custom launch wrappers
need validation. No SQLite dependency or database migration is installed.

Both formats scan from the beginning, stopping after 5 excerpts, 2,000
events, or 8 MiB of transcript data. Runtime reads also stop after 16 page
requests. Later errors can be missed in long sessions. An oversized event
is retried only when it fits the remaining byte budget. A transcript reset
during paging discards that sweep. These bounds limit scanning, not host
storage-restoration latency.

Missing/unreadable transcripts, unavailable runtime APIs, and scan limits
emit a short diagnostic only with `SELF_IMPROVEMENT_HOOK_DEBUG=1`.
Diagnostics do not print raw exceptions or transcripts. Manual capture
remains available when automatic capture cannot read the transcript.

## Opt-In and Safety

- The sweep only runs when `<workspace>/.learnings/` exists. Disable the
  hook with `openclaw hooks disable self-improvement`, not by deleting history
- `ERRORS.md` is created only if missing and is otherwise appended to, never
  overwritten
- Excerpts are truncated to 200 characters and common secret shapes (bearer
  tokens, API keys, GitHub/Slack/AWS tokens, JWTs, long opaque blobs) are
  redacted before writing; excerpts already present in `ERRORS.md` are skipped
- Hook failures are swallowed so the gateway is never affected; set
  `SELF_IMPROVEMENT_HOOK_DEBUG=1` to log failures

## Configuration

No configuration needed. Enable with:

```bash
openclaw hooks enable self-improvement
```

Enable the error sweep by creating the learnings directory:

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

## Testing

```bash
node --test hooks/openclaw/handler.test.js
```
