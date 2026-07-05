# self-improving-agent

Self-improvement skill for OpenClaw. It captures learnings, errors, and feature requests to support continuous improvement across sessions.

**This version is OpenClaw-only.** To use the skill with other agents
(Claude Code, Codex, GitHub Copilot, …), use the original multi-agent
version instead:
https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

## Repository Layout

The publishable skill package is the [`self-improving-agent/`](self-improving-agent/)
subfolder — that is what ClawdHub installs and what you copy into
`~/.openclaw/skills/`. Repo-level files (this README, `.github/` CI) stay
outside the package on purpose.

- Skill entry point: [`self-improving-agent/SKILL.md`](self-improving-agent/SKILL.md)
- OpenClaw hook: [`self-improving-agent/hooks/openclaw/`](self-improving-agent/hooks/openclaw/)

## Installation

```bash
clawdhub install self-improving-agent
```

Or manually — copy the skill subfolder (not the repo root):

```bash
git clone https://github.com/peterskoett/self-improving-agent.git /tmp/self-improving-agent-repo
cp -r /tmp/self-improving-agent-repo/self-improving-agent ~/.openclaw/skills/self-improving-agent
```

## Attribution

Remade for OpenClaw from the original repo:

- https://github.com/pskoett/pskoett-ai-skills
- https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

## Upgrading

See `self-improving-agent/CHANGELOG.md` for version history and per-version
upgrade notes. After upgrading, re-copy the OpenClaw hook and restart the
gateway:

```bash
cp -r ~/.openclaw/skills/self-improving-agent/hooks/openclaw ~/.openclaw/hooks/self-improvement
```

## Uninstalling

See `self-improving-agent/references/uninstall.md` for disable vs.
full-removal steps. Review `.learnings/` before deleting — it contains your
captured learnings, not skill code.
