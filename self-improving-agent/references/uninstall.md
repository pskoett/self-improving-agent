# Uninstall Guide

Disabling the hook stops its reminders and error sweeps. Removing the skill
also stops its instructions from loading in new sessions. Both procedures
below preserve learning history and promoted workspace guidance.

> **Your learnings are data, not skill machinery.** `.learnings/` contains the
> errors, corrections, and insights captured for you. Neither disabling nor
> uninstalling authorizes deleting it. Promoted content in `SOUL.md`,
> `TOOLS.md`, or `AGENTS.md` also remains; review it separately with the user.

## Disable the hook, keep the skill and data

```bash
# Stop the hook (reminder injection + session-end error sweep)
openclaw hooks disable self-improvement
```

Restart the gateway using your usual service manager. The hook may still
appear in `openclaw hooks list`; use `openclaw hooks info self-improvement --json`
to confirm it is disabled. A fresh session should not receive the injected
`SELF_IMPROVEMENT_REMINDER.md`.

There is no separate reminder-only switch. Do not delete or move `.learnings/`
to disable the sweep: that removes accessible history, and first-use
initialisation can recreate the directory. Disable the whole hook instead.
The installed skill can still be invoked for manual capture and maintenance.

## Remove the skill and hook from discovery, keep the data

1. Identify the selected installation paths before moving anything:
```bash
openclaw skills info self-improving-agent --json
openclaw hooks info self-improvement --json
```
   Use their `baseDir`/`handlerPath`, not assumed `~/.openclaw/` paths. Add
   `--agent <id>` when selecting another agent. If the optional hook was
   never installed, skip its disable and move steps.
2. Disable the installed hook as above, then stop the gateway using your
   usual service manager. Pause other agents using the same workspace.
3. Choose a new backup directory outside **all** skill and hook discovery
   roots. Confirm the selected directories contain this skill/hook, not a
   workspace or shared parent. If they are symlinks, resolve their ownership
   and target with the user before proceeding. Do not move another install.
4. Move the selected directories into the backup. Substitute the verified
   absolute paths below; omit the hook line if it was never installed:
```bash
SKILL_DIR='/absolute/path/to/selected/self-improving-agent'
HOOK_DIR='/absolute/path/to/selected/hooks/self-improvement'
BACKUP_DIR='/absolute/path/outside/discovery/self-improvement-backup'

(
  set -e
  mkdir -- "$BACKUP_DIR"
  mv -i -- "$SKILL_DIR" "$BACKUP_DIR/skill"
  mv -i -- "$HOOK_DIR" "$BACKUP_DIR/hook"
)
```
   `mkdir` must succeed on a new directory; an existing destination stops
   the sequence. Check each move succeeded before restarting. Skill-local
   `.learnings/`, if present, stays intact inside the archived skill.
5. Start the gateway and open a fresh session. Verify the selected skill/hook
   is no longer discovered and the reminder is absent. Other installations
   may become active after removal; inspect any remaining result before
   deciding whether the user also wants that copy removed.

Workspace and project `.learnings/` directories stay at their original paths.
Do not rewrite or remove promoted rules as part of uninstalling. Existing
conversations may retain previously loaded instructions; removal affects
future loading, not transcript history.

## Optional permanent data deletion is a separate decision

Only delete captured history if the user explicitly requests deletion of the
identified data, separately from disabling or uninstalling. Confirm the exact
directory and scope, make a backup outside discovery roots, and verify that
the backup preserves the files before proposing a path-specific deletion.
If the backup cannot be verified, stop. Do not infer consent from age, disuse,
or an uninstall request. Edits to promoted guidance need their own scoped
review and authorization; preserve source history and links.

## Verification

- After disabling: the hook is disabled and fresh sessions have no injected reminder.
- After removal: the selected skill/hook paths are outside discovery; check for other active copies.
- Saved learning files and promoted workspace guidance match their pre-operation contents.
- Archived files remain available for inspection or restoration; no user history was deleted.
