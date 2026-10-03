---
name: self-improvement
description: "Injects self-improvement reminder at bootstrap and sweeps ended sessions for errors"
metadata: {"openclaw":{"emoji":"🧠","events":["agent:bootstrap","command:new","command:reset"]}}
---

# Self-Improvement Hook

Injects a reminder to evaluate learnings during agent bootstrap, and detects
errors from ended sessions.

OpenClaw has no per-tool-call hook event, so errors cannot be detected in
real time after each command. This hook detects them with a session-end
error sweep instead.

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
  (`context.previousSessionEntry.sessionFile`, falling back to
  `<workspace>/sessions/<sessionId>.jsonl`)
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
The sweep currently reads JSONL only; SQLite compatibility (issue #29) is
separate from the maintenance workflow.

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
