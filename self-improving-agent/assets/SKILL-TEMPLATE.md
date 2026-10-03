# Skill Template

Template for creating skills extracted from learnings. Copy and customize only with explicit scoped approval. Age, disuse, recurrence, or a resolved incident alone never authorizes extraction or skill rewrites.

## Extraction Workflow

Candidates may be recurring, non-obvious, broadly applicable, or explicitly user-flagged. These are signals to review, not automatic permission or verification.

1. Review the reusable claim through the skill's Maintenance workflow. Establish scope, usefulness, and actual validation evidence separately from incident resolution.
2. Obtain explicit approval for the proposed skill creation/modification.
3. From the workspace, run `~/.openclaw/skills/self-improving-agent/scripts/extract-skill.sh skill-name --dry-run`, then without `--dry-run` after approval; or create manually using a template below.
4. Fill in the content and source path/ID. Keep the skill self-contained, with a name matching its folder and no project-specific hardcoded values.
5. Append the promotion date and target section to the original learning; set `Status: promoted_to_skill`, `Skill-Path`, and Maintenance `Guidance`. Preserve resolution, observations, and earlier promotion/review history.
6. Test examples and read the skill in a fresh session. Later maintenance can propose changes, but editing its assets still requires scoped approval.

---

## SKILL.md Template

```markdown
---
name: skill-name-here
description: "Concise description of when and why to use this skill. Include trigger conditions."
---

# Skill Name

Brief introduction explaining the problem this skill solves and its origin.

## Quick Reference

| Situation | Action |
|-----------|--------|
| [Trigger 1] | [Action 1] |
| [Trigger 2] | [Action 2] |

## Background

Why this knowledge matters. What problems it prevents. Context from the original learning.

## Solution

### Step-by-Step

1. First step with code or command
2. Second step
3. Verification step

### Code Example

\`\`\`language
// Example code demonstrating the solution
\`\`\`

## Common Variations

- **Variation A**: Description and how to handle
- **Variation B**: Description and how to handle

## Gotchas

- Warning or common mistake #1
- Warning or common mistake #2

## Related

- Link to related documentation
- Link to related skill

## Source

Extracted from learning entry.
- **Learning ID**: LRN-YYYYMMDD-XXX
- **Original File**: .learnings/LEARNINGS.md (use the actual path back to the source)
- **Original Category**: correction | insight | knowledge_gap | best_practice
- **Extraction Date**: YYYY-MM-DD
```

---

## Minimal Template

For simple skills that don't need all sections:

```markdown
---
name: skill-name-here
description: "What this skill does and when to use it."
---

# Skill Name

[Problem statement in one sentence]

## Solution

[Direct solution with code/commands]

## Source

- Learning ID: LRN-YYYYMMDD-XXX
- Original File: .learnings/LEARNINGS.md (use the actual path back to the source)
```

---

## Template with Scripts

For skills that include executable helpers:

```markdown
---
name: skill-name-here
description: "What this skill does and when to use it."
---

# Skill Name

[Introduction]

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./scripts/helper.sh` | [What it does] |
| `./scripts/validate.sh` | [What it does] |

## Usage

### Automated (Recommended)

\`\`\`bash
./skills/skill-name/scripts/helper.sh [args]
\`\`\`

### Manual Steps

1. Step one
2. Step two

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/helper.sh` | Main utility |
| `scripts/validate.sh` | Validation checker |

## Source

- Learning ID: LRN-YYYYMMDD-XXX
- Original File: .learnings/LEARNINGS.md (use the actual path back to the source)
```

---

## Naming Conventions

- **Skill name**: lowercase, hyphens for spaces
  - Good: `docker-m1-fixes`, `api-timeout-patterns`
  - Bad: `Docker_M1_Fixes`, `APITimeoutPatterns`

- **Description**: Start with action verb, mention trigger
  - Good: "Handles Docker build failures on Apple Silicon. Use when builds fail with platform mismatch."
  - Bad: "Docker stuff"

- **Files**:
  - `SKILL.md` - Required, main documentation
  - `scripts/` - Optional, executable code
  - `references/` - Optional, detailed docs
  - `assets/` - Optional, templates

---

## Extraction Checklist

Before creating a skill from a learning:

- [ ] User explicitly approved this scoped skill creation/modification
- [ ] Reusable claim has current, scoped validation evidence (not merely status: resolved)
- [ ] Solution is broadly applicable (not one-off)
- [ ] Content is complete (has all needed context)
- [ ] Name follows conventions
- [ ] Description is concise but informative
- [ ] Quick Reference table is actionable
- [ ] Code examples are tested
- [ ] Source learning file and ID are recorded; future maintainers can find the evidence

After creating:

- [ ] Update original learning with `promoted_to_skill` status
- [ ] Add `Skill-Path: skills/skill-name` to learning metadata
- [ ] Append dated promotion target/section and Maintenance Guidance, preserving history
- [ ] Test skill by reading it in a fresh session
