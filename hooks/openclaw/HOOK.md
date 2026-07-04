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

## Opt-In and Safety

- The sweep only runs when `<workspace>/.learnings/` exists — create that
  directory to enable it, delete it to disable it
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
