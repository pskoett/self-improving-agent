# Uninstall Guide

How to disable or fully remove the self-improvement skill. **Disabling** turns
off automatic behavior but keeps your data; **removing** deletes the skill's
files. They are different operations — do the one you mean.

> **Your learnings are data, not skill machinery.** `.learnings/` contains the
> errors, corrections, and insights the skill captured for you. Review or
> archive it before deleting anything. Content the skill *promoted* into
> `SOUL.md`, `TOOLS.md`, or `AGENTS.md` is part of those files now — removing
> the skill does not (and should not) automatically remove it.

## Disable only

```bash
# Stop the hook (reminder injection + session-end error sweep)
openclaw hooks disable self-improvement
```

To keep the bootstrap reminder but disable only the error sweep, remove the
learnings directory instead (archive it first if it has entries):

```bash
rm -r ~/.openclaw/workspace/.learnings
```

Restart the gateway after hook changes.

## Remove completely

```bash
# 1. Disable and remove the hook
openclaw hooks disable self-improvement
rm -r ~/.openclaw/hooks/self-improvement

# 2. Remove the skill
rm -r ~/.openclaw/skills/self-improving-agent

# 3. Optional — remove captured learnings (REVIEW FIRST, this is your data)
rm -r ~/.openclaw/workspace/.learnings
```

Then restart the gateway and verify with `openclaw hooks list` and
`openclaw status`.

Manually review `SOUL.md`, `TOOLS.md`, and `AGENTS.md` in
`~/.openclaw/workspace/` for sections promoted by this skill and delete the
ones you no longer want. If the skill logged `.learnings/` directories into
project repos you worked in, review and remove those separately.

## Verification

- `openclaw hooks list` no longer shows `self-improvement`
- New sessions no longer contain `SELF_IMPROVEMENT_REMINDER.md`
- No stray `.learnings/` directories remain that you didn't choose to keep
