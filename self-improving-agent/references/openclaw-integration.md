# OpenClaw Integration

Complete setup and usage guide for integrating the self-improvement skill with OpenClaw.

## Overview

OpenClaw uses workspace-based prompt injection combined with event-driven hooks. Context is injected from workspace files at session start, and hooks can trigger on lifecycle events.

## Workspace Structure

```
~/.openclaw/                      
├── workspace/                   # Working directory
│   ├── AGENTS.md               # Multi-agent coordination patterns
│   ├── SOUL.md                 # Behavioral guidelines and personality
│   ├── TOOLS.md                # Tool capabilities and gotchas
│   ├── MEMORY.md               # Long-term memory (main session only)
│   └── memory/                 # Daily memory files
│       └── YYYY-MM-DD.md
├── skills/                      # Installed skills
│   └── <skill-name>/
│       └── SKILL.md
└── hooks/                       # Custom hooks
    └── <hook-name>/
        ├── HOOK.md
        └── handler.ts
```

## Quick Setup

### 1. Install the Skill

```bash
openclaw skills install @pskoett/self-improving-agent
```

Or with the ClawHub CLI (`npm i -g clawhub`) — note this installs into
`./skills` under the current working directory, not the workspace:

```bash
clawhub install @pskoett/self-improving-agent
```

Or copy manually — the skill package is the `self-improving-agent/`
subfolder of the repo, not the repo root:

```bash
git clone https://github.com/pskoett/self-improving-agent.git /tmp/self-improving-agent-repo
cp -r /tmp/self-improving-agent-repo/self-improving-agent ~/.openclaw/skills/self-improving-agent
```

### 2. Install the Hook (Optional)

Use [Install or Upgrade the Hook](#install-or-upgrade-the-hook) below, then
enable it with `openclaw hooks enable self-improvement`.

The hook does two things:

- **`agent:bootstrap`** — injects the self-improvement reminder into session
  context (and flags auto-detected errors awaiting triage)
- **`command:new` / `command:reset`** — sweeps the transcript of the session
  that just ended for error patterns and appends pending entries to
  `<workspace>/.learnings/ERRORS.md` (only if `.learnings/` exists — see
  [Error Detection](#error-detection))

### 3. Create Learning Files

Create the `.learnings/` directory in your workspace:

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

Or in the skill directory:

```bash
mkdir -p ~/.openclaw/skills/self-improving-agent/.learnings
```

## Install or Upgrade the Hook

Run these steps in one Bash session. First locate the selected skill and,
for an upgrade, the active hook:

```bash
openclaw skills info self-improving-agent --json
openclaw hooks info self-improvement --json
```

Use the skill's `baseDir` and the hook's `baseDir`/`handlerPath`. Add
`--agent <id>` to both commands when selecting another agent. The hook
lookup may report "not found" on a fresh install.

Do not assume the skill is under `~/.openclaw/skills/`: the built-in
installer defaults to workspace `skills/`, ClawHub defaults to `./skills`,
and manual/global installs may use the managed skills directory. If the
skill is not discovered, select its known installation directory explicitly.
Do not use the first result of a filesystem search when several copies exist.

Set these paths explicitly. For a fresh managed hook install, use
`${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/hooks/self-improvement` as `HOOK_DIR`.
For an upgrade, use the existing hook's reported directory, even if it is
workspace-local. Stage outside **all** hook discovery directories:

```bash
set -eu
SKILL_DIR='/absolute/path/to/selected/self-improving-agent'
HOOK_DIR='/absolute/path/to/active/hooks/self-improvement'
BACKUP_ROOT="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/hook-backups"

test -f "$SKILL_DIR/hooks/openclaw/HOOK.md" &&
test -f "$SKILL_DIR/hooks/openclaw/handler.ts" &&
test -f "$SKILL_DIR/hooks/openclaw/handler.js" || { echo 'Wrong skill directory'; exit 1; }
test ! -L "$HOOK_DIR" || { echo 'Resolve the hook symlink before upgrading'; exit 1; }
mkdir -p "$BACKUP_ROOT" "$(dirname "$HOOK_DIR")"
STAGE=$(mktemp -d "$BACKUP_ROOT/self-improvement.XXXXXX")
cp -a "$SKILL_DIR/hooks/openclaw" "$STAGE/candidate"
if test -d "$HOOK_DIR"; then
  diff -ru "$HOOK_DIR" "$STAGE/candidate" || {
    status=$?
    test "$status" -eq 1 || exit "$status"
  }
fi
printf 'Review candidate: %s\n' "$STAGE/candidate"
```

**Stop and review the diff before replacing anything.** `diff` exit 1 means
differences; larger values mean a read failure. Merge any local patches you
still need into the candidate, in **both** `handler.ts` and `handler.js`.
OpenClaw prefers the TypeScript handler; this package also ships JavaScript
for compatibility. Keep unrelated local files only if they are still needed.

After review, test the candidate, preserve the entire active directory, and
move the candidate into the now-empty destination. Stop the gateway using
your usual service manager before replacement; do not run concurrent upgrades.
Never repeat `cp -r source/openclaw existing/self-improvement`: it nests the
directory and leaves the old handler active. Copying `source/openclaw/.`
instead would overwrite patches without review.

```bash
(
  set -eu
  node --test "$STAGE/candidate/handler.test.js"
  test ! -e "$STAGE/previous"
  if test -e "$HOOK_DIR"; then
    mv "$HOOK_DIR" "$STAGE/previous"
  fi
  if ! mv "$STAGE/candidate" "$HOOK_DIR"; then
    if test -e "$STAGE/previous" && test ! -e "$HOOK_DIR"; then
      mv "$STAGE/previous" "$HOOK_DIR"
    fi
    exit 1
  fi
)
```

The old copy remains at `$STAGE/previous`, outside hook discovery. Do not
put backups containing `HOOK.md` under `hooks/`, where they can be loaded
as additional hooks. `.learnings/` is not touched by this procedure.

Enable with `openclaw hooks enable self-improvement` if needed, then start
the gateway using your service manager. Run
`openclaw hooks info self-improvement --json` again and confirm `handlerPath`
points directly into `HOOK_DIR`, not a nested `openclaw/` directory. In a
disposable session, produce a known command error and use `/new` or `/reset`;
with workspace `.learnings/` present, confirm the error appears in `ERRORS.md`.
Unit tests alone do not verify the running gateway loaded the replacement.

## Injected Prompt Files

### AGENTS.md

Purpose: Multi-agent workflows and delegation patterns.

```markdown
# Agent Coordination

## Delegation Rules
- Use explore agent for open-ended codebase questions
- Spawn sub-agents for long-running tasks
- Use sessions_send for cross-session communication

## Session Handoff
When delegating to another session:
1. Provide full context in the handoff message
2. Include relevant file paths
3. Specify expected output format
```

### SOUL.md

Purpose: Behavioral guidelines and communication style.

```markdown
# Behavioral Guidelines

## Communication Style
- Be direct and concise
- Avoid unnecessary caveats and disclaimers
- Use technical language appropriate to context

## Error Handling
- Admit mistakes promptly
- Provide corrected information immediately
- Log significant errors to learnings
```

### TOOLS.md

Purpose: Tool capabilities, integration gotchas, local configuration.

```markdown
# Tool Knowledge

## Self-Improvement Skill
Log learnings to `.learnings/` for continuous improvement.

## Local Tools
- Document tool-specific gotchas here
- Note authentication requirements
- Track integration quirks
```

## Learning Workflow

### Capturing Learnings

1. **Capture**: Log observations in `.learnings/` and put the reusable claim's Maintenance block beside the entry. Leave unknown classifications explicit; do not bulk-migrate legacy entries.
2. **Review/reuse**: Select relevant/due claims, including one-off and unpromoted entries. Follow [SKILL.md Maintenance](../SKILL.md#maintenance-cause-aware-context-decay): type selects the check, rate selects cadence, relevant events override it. Record actual dated evidence, not just a review timestamp. Unavailable/conflicting evidence stays unresolved.
3. **Promote**: Only supported, useful guidance goes into workspace/project files. Link it to the source learning file + ID and append the promotion date/target section to the source entry. Resolution and recurrence alone are not validation.
4. **Maintain**: Retain, revise, externalize to a usable authoritative retrieval instruction, or retire from active guidance. Preserve observations, resolution, promotion and review history; follow source links to update affected guidance within granted scope. Reviews are not new occurrences.

This workflow requires only this skill and the existing Markdown files. No companion skill, scheduler, background revalidation, or other memory backend is needed. The hook is optional and cannot enforce agent judgment or validate claims. Age/disuse never authorizes changing preferences, weakening security policy, or modifying skill assets; skill edits need explicit scoped approval.

### Promotion Decision Tree

```
Is the scoped claim validated and useful beyond the incident?
├── No → Keep in .learnings/; maintain it even if never promoted
└── Yes → Is it project-specific?
    ├── Yes → Promote to that project's agent file with a source link
    └── No → Is it behavioral/style-related?
        ├── Yes → SOUL.md, with a source link
        └── No → TOOLS.md (tools) or AGENTS.md (workflow), with a source link
```

### Promotion Format Examples

**From learning:**
> Git push to GitHub fails without auth configured - triggers desktop prompt

**To TOOLS.md:**
```markdown
## Git
- Don't push without confirming auth is configured
- Use `gh auth status` to check GitHub CLI auth
Source: .learnings/ERRORS.md#ERR-20250115-GIT (GitHub CLI workflow only)
```

## Inter-Agent Communication

OpenClaw provides tools for cross-session communication:

Use these only when cross-session sharing is explicitly needed and the environment is trusted. Prefer short sanitized summaries over raw transcripts, command output, or secret-bearing content.

### sessions_list

View active and recent sessions:
```
sessions_list(activeMinutes=30, messageLimit=3)
```

### sessions_history

Read transcript from another session:
```
sessions_history(sessionKey="session-id", limit=50)
```

Only read another session's transcript when the user explicitly wants shared context or continuation across sessions.

### sessions_send

Send message to another session:
```
sessions_send(sessionKey="session-id", message="Learning: API requires X-Custom-Header")
```

Prefer sending a concise learning summary plus relevant paths rather than forwarding raw transcript content.

### sessions_spawn

Spawn a background sub-agent:
```
sessions_spawn(task="Research X and report back", label="research")
```

## Internal Hook Events

| Event | When It Fires |
|-------|---------------|
| `agent:bootstrap` | Before workspace files inject |
| `command:new` | When `/new` command issued |
| `command:reset` | When `/reset` command issued |
| `command:stop` | When `/stop` command issued |
| `gateway:startup` | When gateway starts |
| `gateway:shutdown` | When gateway shuts down |
| `message:received` / `message:sent` | Around message delivery |
| `session:compact:before` / `:after` | Around session compaction |

This table covers internal `HOOK.md` events. That system has no per-tool-call
callback, so this integration retains session-end detection.

OpenClaw's separate [typed plugin hook catalog](https://docs.openclaw.ai/plugins/hooks/reference)
includes `api.on('before_tool_call', ...)` for modifying/gating tool calls
and `api.on('after_tool_call', ...)` for observing results, errors, and duration.
Registering those names in `HOOK.md` does not turn this hook into a plugin.
A real-time detector would be a separate plugin implementation, not a
configuration switch for this hook.

## Error Detection

The skill's hook (`hooks/openclaw/`) implements a **session-end error
sweep**:

1. When `/new` or `/reset` ends a session, the hook resolves the ended
   session's transcript from `context.previousSessionEntry`, using
   `sessionEntry` only when the previous entry is absent. It reads explicit
   JSONL paths directly, or reads SQLite through OpenClaw's runtime using
   the exact ended-session identity. Without an explicit path or marker,
   an existing `<workspace>/sessions/<sessionId>.jsonl` takes precedence
   over runtime lookup. Only one source is scanned, even if it has no errors.
2. The transcript is scanned against a fixed error-pattern list (`Error:`,
   `command not found`, `Traceback`, `npm ERR!`, `Permission denied`, …).
3. Matches are appended to `<workspace>/.learnings/ERRORS.md` as a `pending`
   entry with `Source: openclaw-error-sweep`, containing at most 5 short
   excerpts (truncated to 200 chars, common secret shapes redacted,
   duplicates skipped). Each entry is stamped with deterministic
   `Pattern-Key` values derived from the matched pattern (for example
   `ModuleNotFoundError` → `deps.module-not-found`), so recurrences can be
   counted by key during triage — see the Pattern-Key Taxonomy in `SKILL.md`.
4. At the next `agent:bootstrap`, the injected reminder includes a
   **pending triage** note so the agent reviews the auto-detected entries —
   confirming real errors, filling in fixes, or marking false positives with
   a reason while preserving the original sweep. Maintenance starts as
   unknown/pending: classify unrelated claims separately during triage,
   never from the regex Pattern-Keys. Count only confirmed new occurrences.

### Enabling / Disabling the Sweep

The sweep is opt-in and gated on the `.learnings/` directory:

```bash
# Enable
mkdir -p ~/.openclaw/workspace/.learnings

# Disable the hook without deleting learning history
openclaw hooks disable self-improvement
```

Disabling the hook also stops reminders; manual capture and maintenance still work.

### Sweep Limitations

- JSONL and SQLite (including compressed events) are supported. SQLite is
  tested with OpenClaw 2026.10.4 on Linux/Node 26 and uses a private host
  runtime export, not a stable public API. Future versions and custom
  launch wrappers need validation. See the hook's
  [compatibility notes](../hooks/openclaw/HOOK.md#transcript-compatibility).
- Scans start at the beginning and stop after 5 excerpts, 2,000 events,
  8 MiB, or 16 runtime page requests. Later errors can be missed. Missing
  sources and limits produce diagnostics with
  `SELF_IMPROVEMENT_HOOK_DEBUG=1`; manual logging remains available.
- Sessions that are never ended with `/new` or `/reset` are not swept.
- Detection happens at session end, not immediately after the failing
  command; this integration uses internal hooks rather than typed plugin hooks.
- Pattern matching is heuristic; it can flag false positives such as prose
  containing the word "failed" — that's what the triage step is for.
- Excerpts are redacted with best-effort rules; treat `.learnings/` as
  potentially sensitive and keep it out of version control by default.

## Detection Triggers

### Standard Triggers
- User corrections ("No, that's wrong...")
- Command failures (non-zero exit codes)
- API errors
- Knowledge gaps

### OpenClaw-Specific Triggers

| Trigger | Action |
|---------|--------|
| Tool call error | Capture in .learnings/ERRORS.md; validate before promoting to TOOLS.md |
| Session handoff confusion | Capture in .learnings/; validate before promoting a scoped workflow to AGENTS.md |
| Model behavior surprise | Capture expected vs actual in .learnings/; review before promoting to SOUL.md |
| Skill issue | Log to .learnings/ or report upstream |

## Verification

Check hook is registered:

```bash
openclaw hooks list
```

Check skill is loaded:

```bash
openclaw status
```

## Troubleshooting

### Hook not firing

1. Ensure hooks enabled in config
2. Restart gateway after config changes
3. Check gateway logs for errors

### Learnings not persisting

1. Verify `.learnings/` directory exists
2. Check file permissions
3. Ensure workspace path is configured correctly

### Error sweep not writing entries

1. Verify `<workspace>/.learnings/` exists (the sweep is opt-in and skips
   silently without it)
2. End the session with `/new` or `/reset` — the sweep only runs on those
   commands
3. Confirm the ended session has a JSONL transcript or SQLite identity;
   current OpenClaw storage need not create `<workspace>/sessions/`
4. Run the gateway with `SELF_IMPROVEMENT_HOOK_DEBUG=1` to surface hook errors
5. Remember excerpts already present in `ERRORS.md` are skipped (dedupe)

### Skill not loading

1. Check skill is in skills directory
2. Verify SKILL.md has correct frontmatter
3. Run `openclaw status` to see loaded skills
