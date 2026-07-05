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
clawdhub install self-improving-agent
```

Or copy manually — the skill package is the `self-improving-agent/`
subfolder of the repo, not the repo root:

```bash
git clone https://github.com/peterskoett/self-improving-agent.git /tmp/self-improving-agent-repo
cp -r /tmp/self-improving-agent-repo/self-improving-agent ~/.openclaw/skills/self-improving-agent
```

### 2. Install the Hook (Optional)

Copy the hook to OpenClaw's hooks directory:

```bash
cp -r ~/.openclaw/skills/self-improving-agent/hooks/openclaw ~/.openclaw/hooks/self-improvement
```

Enable the hook:

```bash
openclaw hooks enable self-improvement
```

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

1. **In-session**: Log to `.learnings/` as usual
2. **Cross-session**: Promote to workspace files

### Promotion Decision Tree

```
Is the learning project-specific?
├── Yes → Keep in .learnings/
└── No → Is it behavioral/style-related?
    ├── Yes → Promote to SOUL.md
    └── No → Is it tool-related?
        ├── Yes → Promote to TOOLS.md
        └── No → Promote to AGENTS.md (workflow)
```

### Promotion Format Examples

**From learning:**
> Git push to GitHub fails without auth configured - triggers desktop prompt

**To TOOLS.md:**
```markdown
## Git
- Don't push without confirming auth is configured
- Use `gh auth status` to check GitHub CLI auth
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

## Available Hook Events

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

**Important:** OpenClaw has **no per-tool-call event** — nothing fires after
each individual tool call, so real-time per-command error detection is not
possible. Error detection is done at session end instead (see below).

## Error Detection

The skill's hook (`hooks/openclaw/`) implements a **session-end error
sweep**:

1. When `/new` or `/reset` ends a session, the hook resolves the ended
   session's transcript from `context.previousSessionEntry` (falling back to
   `<workspace>/sessions/<sessionId>.jsonl`) — the same source OpenClaw's
   bundled `session-memory` hook uses.
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
   confirming real errors, filling in fixes, or deleting noise.

### Enabling / Disabling the Sweep

The sweep is opt-in and gated on the `.learnings/` directory:

```bash
# Enable
mkdir -p ~/.openclaw/workspace/.learnings

# Disable (reminder injection keeps working)
rm -r ~/.openclaw/workspace/.learnings
```

### Sweep Limitations

- Sessions that are never ended with `/new` or `/reset` are not swept.
- Detection happens at session end, not immediately after the failing
  command — there is no per-tool-call event to hook.
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
| Tool call error | Log to TOOLS.md with tool name |
| Session handoff confusion | Log to AGENTS.md with delegation pattern |
| Model behavior surprise | Log to SOUL.md with expected vs actual |
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
3. Confirm a transcript exists in `<workspace>/sessions/`
4. Run the gateway with `SELF_IMPROVEMENT_HOOK_DEBUG=1` to surface hook errors
5. Remember excerpts already present in `ERRORS.md` are skipped (dedupe)

### Skill not loading

1. Check skill is in skills directory
2. Verify SKILL.md has correct frontmatter
3. Run `openclaw status` to see loaded skills
