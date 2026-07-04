# self-improvement

Self-improvement skill for OpenClaw. It captures learnings, errors, and feature requests to support continuous improvement across sessions.

**This version is OpenClaw-only.** To use the skill with other agents
(Claude Code, Codex, GitHub Copilot, …), use the original multi-agent
version instead:
https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

## Attribution

Remade for OpenClaw from the original repo:

- https://github.com/pskoett/pskoett-ai-skills
- https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

## Main File

- `SKILL.md`

## Upgrading

See `CHANGELOG.md` for version history and per-version upgrade notes. After
upgrading, re-copy the OpenClaw hook and restart the gateway:

```bash
cp -r hooks/openclaw ~/.openclaw/hooks/self-improvement
```

## Uninstalling

See `references/uninstall.md` for disable vs. full-removal steps. Review
`.learnings/` before deleting — it contains your captured learnings, not
skill code.
