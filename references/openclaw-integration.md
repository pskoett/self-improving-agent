# OpenClaw Integration

Setup guide for using the self-improvement skill with OpenClaw.

## Overview

OpenClaw uses event-driven hooks (not prompt-intercept like Claude Code). The hook fires on `agent:bootstrap` to inject a reminder before workspace files are loaded.

## Quick Setup

### 1. Install the Skill

Copy the skill to OpenClaw's skills directory:

```bash
cp -r self-improving-agent ~/.openclaw/skills/
```

Configure OpenClaw to load from the skills directory:

```json
{
  "skills": {
    "load": {
      "extraDirs": ["~/.openclaw/skills"]
    }
  }
}
```

### 2. Install the Hook

Copy the hook to OpenClaw's hooks directory:

```bash
cp -r hooks/openclaw ~/.openclaw/hooks/self-improvement
```

Enable the hook:

```bash
openclaw hooks enable self-improvement
```

Enable internal hooks in config:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "self-improvement": {
          "enabled": true
        }
      }
    }
  }
}
```

### 3. Create Learning Files

Create the `.learnings/` directory in your workspace:

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

Create the log files with headers:

**LEARNINGS.md:**
```markdown
# Learnings Log

Captured learnings, corrections, and discoveries. Review before major tasks.

---
```

**ERRORS.md:**
```markdown
# Errors Log

Command failures, exceptions, and unexpected behaviors.

---
```

**FEATURE_REQUESTS.md:**
```markdown
# Feature Requests

Capabilities requested by user that don't currently exist.

---
```

## How It Works

1. **Hook fires** on `agent:bootstrap` (before workspace files inject)
2. **Reminder injected** into agent context as virtual bootstrap file
3. **Agent evaluates** after tasks whether to log learnings
4. **Patterns promoted** to SOUL.md, AGENTS.md, or TOOLS.md when proven

## Available Events

OpenClaw hooks support these events:

| Event | When It Fires |
|-------|---------------|
| `agent:bootstrap` | Before workspace files inject (used by this skill) |
| `command:new` | When `/new` command issued |
| `command:reset` | When `/reset` command issued |
| `command:stop` | When `/stop` command issued |
| `gateway:startup` | When gateway starts |

## Promotion Targets

| Learning Type | Promote To |
|---------------|------------|
| Behavioral patterns | `SOUL.md` |
| Workflow improvements | `AGENTS.md` |
| Tool gotchas | `TOOLS.md` |

## Differences from Claude Code

| Feature | Claude Code | OpenClaw |
|---------|-------------|----------|
| Prompt intercept | ✓ UserPromptSubmit | ✗ Not available |
| Tool use detection | ✓ PostToolUse | ✗ Not available |
| Bootstrap injection | ✗ | ✓ agent:bootstrap |
| Command hooks | ✗ | ✓ command:new/reset/stop |

OpenClaw hooks are lifecycle-based, not prompt-based. The reminder is injected once at session start, not after every message.

## Verification

Check hook is registered:

```bash
openclaw hooks list
```

Should show:
```
🧠 self-improvement ✓
```

## Troubleshooting

### Hook not discovered

1. Check directory structure:
   ```bash
   ls ~/.openclaw/hooks/self-improvement/
   # Should show: HOOK.md, handler.ts
   ```

2. Verify HOOK.md has correct frontmatter

### Hook not firing

1. Ensure internal hooks enabled in config
2. Restart gateway after config changes
3. Check gateway logs for errors

### Learnings not persisting

1. Verify `.learnings/` directory exists in workspace
2. Check file permissions
3. Ensure workspace path is configured correctly
