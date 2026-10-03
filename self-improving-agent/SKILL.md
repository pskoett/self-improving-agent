---
name: self-improving-agent
description: "Captures and maintains learnings, errors, and corrections. Use when a command fails, the user corrects an assumption, a capability is missing, knowledge is outdated, or a better approach is found. Review relevant saved guidance before major tasks, reuse, and promotion; revalidate it according to what could change and how quickly."
version: "4.0.2"
metadata:
---

# Self-Improvement Skill

Log learnings and errors to markdown files for continuous improvement. Agents can later process these into fixes, and important learnings get promoted to workspace memory. This version of the skill is built for OpenClaw only — for other agents, see the original multi-agent version at https://github.com/pskoett/pskoett-ai-skills.

Capture, review, reuse, promotion, and maintenance are self-contained here: no companion skill, service, plugin, memory backend, or OpenClaw core change is required. The optional hook only reminds and captures possible errors; it does not enforce this workflow or revalidate claims.

## First-Use Initialisation

Before logging anything, ensure the `.learnings/` directory and files exist in the project or workspace root. If any are missing, create them:

```bash
mkdir -p .learnings
[ -f .learnings/LEARNINGS.md ] || printf "# Learnings\n\nCorrections, insights, and knowledge gaps captured during development.\n\n**Categories**: correction | insight | knowledge_gap | best_practice\n\n---\n" > .learnings/LEARNINGS.md
[ -f .learnings/ERRORS.md ] || printf "# Errors\n\nCommand failures and integration errors.\n\n---\n" > .learnings/ERRORS.md
[ -f .learnings/FEATURE_REQUESTS.md ] || printf "# Feature Requests\n\nCapabilities requested by the user.\n\n---\n" > .learnings/FEATURE_REQUESTS.md
```

Never overwrite existing files. This is a no-op if `.learnings/` is already initialised.

Do not log secrets, tokens, private keys, environment variables, or full source/config files unless the user explicitly asks for that level of detail. Prefer short summaries or redacted excerpts over raw command output or full transcripts.

If you want automatic reminders and session-end error detection, enable the opt-in hook described in [Optional: Enable Hook](#optional-enable-hook).

## Quick Reference

| Situation | Action |
|-----------|--------|
| Command/operation fails | Log to `.learnings/ERRORS.md` |
| User corrects you | Log to `.learnings/LEARNINGS.md` with category `correction` |
| User wants missing feature | Log to `.learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | Log to `.learnings/ERRORS.md` with integration details |
| Knowledge was outdated | Log to `.learnings/LEARNINGS.md` with category `knowledge_gap` |
| Found better approach | Log to `.learnings/LEARNINGS.md` with category `best_practice` |
| Simplify/Harden recurring patterns | Log/update `.learnings/LEARNINGS.md` with `Source: simplify-and-harden` and a stable `Pattern-Key` |
| Similar to existing entry | Search by `Pattern-Key`, confirm the same claim/scope; count only a new occurrence |
| Reusing or promoting saved knowledge | Review relevant/due claims using Maintenance below, including one-off/unpromoted entries |
| Source, decision, dependency, or task changes | Revalidate affected claims; do not expire them by age |
| Workflow improvements | Promote to `AGENTS.md` (workspace) |
| Tool gotchas | Promote to `TOOLS.md` (workspace) |
| Behavioral patterns | Promote to `SOUL.md` (workspace) |

## OpenClaw Setup

OpenClaw uses workspace-based prompt injection with automatic skill loading.

### Installation

**Via OpenClaw's built-in installer (recommended)** — installs into the
active OpenClaw workspace:
```bash
openclaw skills install @pskoett/self-improving-agent
```

**Via the ClawHub CLI** (`npm i -g clawhub`) — installs into `./skills`
under the current working directory, not the workspace:
```bash
clawhub install @pskoett/self-improving-agent
```

**Manual** (the skill lives in the repo's `self-improving-agent/` subfolder;
copy that folder, not the repo root):
```bash
git clone https://github.com/pskoett/self-improving-agent.git /tmp/self-improving-agent-repo
cp -r /tmp/self-improving-agent-repo/self-improving-agent ~/.openclaw/skills/self-improving-agent
```

Remade for openclaw from original repo : https://github.com/pskoett/pskoett-ai-skills - https://github.com/pskoett/pskoett-ai-skills/tree/main/skills/self-improvement

### Workspace Structure

OpenClaw injects these files into every session:

```
~/.openclaw/workspace/
├── AGENTS.md          # Multi-agent workflows, delegation patterns
├── SOUL.md            # Behavioral guidelines, personality, principles
├── TOOLS.md           # Tool capabilities, integration gotchas
├── MEMORY.md          # Long-term memory (main session only)
├── memory/            # Daily memory files
│   └── YYYY-MM-DD.md
└── .learnings/        # This skill's log files
    ├── LEARNINGS.md
    ├── ERRORS.md
    └── FEATURE_REQUESTS.md
```

### Create Learning Files

```bash
mkdir -p ~/.openclaw/workspace/.learnings
```

Then create the log files (or copy from `assets/`):
- `LEARNINGS.md` — corrections, knowledge gaps, best practices
- `ERRORS.md` — command failures, exceptions
- `FEATURE_REQUESTS.md` — user-requested capabilities

### Promotion Targets

When learnings prove broadly applicable, promote them to workspace files:

| Learning Type | Promote To | Example |
|---------------|------------|---------|
| Behavioral patterns | `SOUL.md` | "Be concise, avoid disclaimers" |
| Workflow improvements | `AGENTS.md` | "Spawn sub-agents for long tasks" |
| Tool gotchas | `TOOLS.md` | "Git push needs auth configured first" |

### Inter-Session Communication

OpenClaw provides tools to share learnings across sessions:

- **sessions_list** — View active/recent sessions
- **sessions_history** — Read another session's transcript  
- **sessions_send** — Send a learning to another session
- **sessions_spawn** — Spawn a sub-agent for background work

Use these only in trusted environments and only when the user explicitly wants cross-session sharing. Prefer sending a short sanitized summary and relevant file paths, not raw transcripts, secrets, or full command output.

### Optional: Enable Hook

For automatic reminders at session start and error detection at session end:

```bash
cp -r ~/.openclaw/skills/self-improving-agent/hooks/openclaw ~/.openclaw/hooks/self-improvement
openclaw hooks enable self-improvement
```

Fires on `agent:bootstrap` (injects the reminder, plus a pending-triage note
when auto-detected errors await review) and on `command:new`/`command:reset`
(sweeps the ended session's transcript for error patterns into
`<workspace>/.learnings/ERRORS.md`; opt-in — runs only when `.learnings/`
exists). OpenClaw has no per-tool-call hook event, so error detection happens
at session end. See `references/openclaw-integration.md` for details and
sweep limitations.

## Logging Format

Append an entry using the templates in [assets/LEARNINGS.md](assets/LEARNINGS.md), [assets/ERRORS.md](assets/ERRORS.md), or [assets/FEATURE_REQUESTS.md](assets/FEATURE_REQUESTS.md). Keep the observation, context, suggested action, and metadata. See [examples](references/examples.md) for completed entries.

At capture, add the Maintenance block below for each reusable claim. If no inference is established yet, record `Claim: unknown — needs triage` rather than inventing a rule. Legacy entries remain valid log records: initialize metadata only when captured or touched in relevant review, without bulk migration.

## Maintenance: Cause-Aware Context Decay

Historical observations do not expire. Maintain the reusable inference or instruction, not whether the incident happened. This applies to all three `.learnings/` files, including one-off and unpromoted entries. Truth and usefulness are separate: a true fact may be irrelevant to this task; a useful workaround may no longer be correct.

### Type determines HOW to revalidate

| Type | Check |
|------|-------|
| `reality` | Read the current authoritative source or inspect the current environment for the scoped fact. |
| `decision` | Find an authoritative, applicable superseding decision; confirm its scope and effective state. Age or a different team's choice does not supersede it. |
| `dependency` | Establish the relevant version/configuration, then perform representative behavioral verification in that environment. An upgrade triggers a check, not automatic retirement. |
| `relevance` | Assess applicability and usefulness for the current task/project. Disuse does not prove falsehood. |

Use `unknown` when the cause is not established. If a claim has multiple causes, check each or split distinct claims into named Maintenance blocks. Do not infer semantic type/rate from priority, status, recurrence, or `Pattern-Key` regex matches. Session sweeps may mix unrelated errors: classify claims during triage, preserving and linking the original sweep.

### Rate determines WHEN to review

- `fast`: volatile; check near each relevant use.
- `medium`: revisit at relevant task/project milestones during active work.
- `slow`: stable; review occasionally at relevant major changes or milestones.
- `durable`: expected to persist; review when authority, assumptions, or applicability is challenged.
- `unknown`: no supported cadence yet; triage before relying on it.

These are qualitative rates, not universal half-lives, expiry dates, or deletion rules. Record a concrete trigger for the claim. Relevant events (source updates, superseding decisions, dependency/configuration changes, project/task shifts, contradictions) override cadence, even for `durable` claims. No scheduler or autonomous background revalidation is needed.

### Lightweight metadata beside the original entry

```markdown
### Maintenance
- Claim: reusable inference/instruction, or unknown — needs triage
- Scope: applicable project/task/environment and limits, or unknown
- Authority: source path/section, decision ID, environment, or unknown
- Decay: reality | decision | dependency | relevance | unknown / fast | medium | slow | durable | unknown
- Revalidate: event/cadence; specific check to perform
- Validation: pending | verified | unresolved | contradicted
- Evidence: none yet; when checked, actual date, source/version/configuration, check and result (including failures/conflicts)
- Disposition: retain | revise | externalize | retire; reason and task applicability
- Guidance: none, or target file + section and source-learning ID
```

Start with `Validation: pending`, `Evidence: none yet`, and `Disposition: retain — provisional, not validated` unless actual evidence supports more. An attempted review is not validation: unavailable or conflicting evidence stays `unresolved`, with the attempt date, blocker, and next check; do not advance a successful validation date. Keep past evidence dated and scoped when appending later results. `Status` tracks issue resolution/promotion, `Validation` tracks support for the claim, and `Disposition` tracks active guidance; none implies the others.

### Review, reuse, and promotion loop

1. **Select** entries relevant to the current task by area, files, keywords, or source IDs, plus affected/due claims at natural breakpoints. Do not audit the whole log every turn or select only pending/promoted/repeated entries.
2. **Triage** legacy/mixed entries: identify the reusable claim, scope, authority, type/rate, and trigger. Keep unknowns explicit. A resolved incident, successful recovery, or repeated occurrence does not prove a universally valid rule.
3. **Check** applicability and whether the trigger fired or evidence is due before reuse or promotion. Run the type-appropriate check when needed; record actual evidence, not an intended command. If evidence is missing/conflicting, do not present or promote the claim as verified. State uncertainty and seek the source or use an appropriately scoped fallback; do not remove safeguards while blocked.
4. **Choose** `retain` (supported and useful, or explicitly provisional while blocked), `revise` (correct/narrow with evidence), `externalize` (replace volatile detail with a usable retrieval instruction), or `retire` (exclude from active guidance with an evidenced reason). Externalization names where to look, what to read/test, and what to do if inaccessible/conflicting; a vague “check docs” is insufficient. Verify that the retrieval path is usable before treating it as validated.
5. **Record and propagate**: append a dated review note with the outcome, reason, evidence, and old → new claim when changed. Preserve original observations, resolution, promotion targets/dates, and prior reviews. Update affected promoted guidance using its source link; keep its source-learning ID beside the revised rule (or a retirement note pointing to the preserved history). Never inflate `Recurrence-Count`/`Last-Seen` just because a review ran.

Never erase learning/promotion history or delete by age. Never change user preferences, weaken security policies, or rewrite skill assets merely because they are old or unused. Skill creation/modification requires explicit scoped approval; approval for this integration does not authorize future skill rewrites. If a needed target edit is outside granted scope, record the proposed change as pending in the source entry and report the still-active guidance rather than silently claiming it is updated.

For worked review outcomes and provenance, read [maintenance examples](references/examples.md#maintenance-examples).

## ID Generation

Format: `TYPE-YYYYMMDD-XXX`
- TYPE: `LRN` (learning), `ERR` (error), `FEAT` (feature)
- YYYYMMDD: Current date
- XXX: Sequential number or random 3 chars (e.g., `001`, `A7B`)

Examples: `LRN-20250115-001`, `ERR-20250115-A3F`, `FEAT-20250115-002`

## Resolving Entries

When an issue is fixed, update the entry:

1. Change `**Status**: pending` → `**Status**: resolved`
2. Add resolution block after Metadata:

```markdown
### Resolution
- **Resolved**: 2025-01-16T09:00:00Z
- **Commit/PR**: abc123 or #42
- **Notes**: Brief description of what was done
```

Other status values:
- `in_progress` - Actively being worked on
- `wont_fix` - Decided not to address (add reason in Resolution notes)
- `promoted` - Elevated to a workspace file (`SOUL.md`, `TOOLS.md`, `AGENTS.md`)

Keep the Resolution block when promoting. A working fix establishes what happened in that incident; validate any reusable rule separately through Maintenance.

## Promoting to Workspace Memory

When a learning is broadly applicable (not a one-off fix), promote it to a workspace file so every session inherits it.

### When to Promote

- Learning applies across multiple files/features
- Knowledge any contributor (human or AI) should know
- Prevents recurring mistakes
- Documents project-specific conventions

### Promotion Targets

| Target | What Belongs There |
|--------|-------------------|
| `SOUL.md` | Behavioral guidelines, communication style, principles |
| `TOOLS.md` | Tool capabilities, usage patterns, integration gotchas |
| `AGENTS.md` | Workflows, delegation patterns, automation rules |

When the learning is specific to a project repo you work in (not the
workspace), promote to that project's own agent file (e.g. its `AGENTS.md`)
instead.

### How to Promote

1. **Review** the scoped claim through Maintenance first. Promote only supported, useful guidance, not unresolved assumptions or recurrence alone.
2. **Distill and add** a concise scoped rule or usable retrieval instruction to the appropriate target. Include `Source: .learnings/<file>.md#<entry-ID>` beside it (use the actual relative path from the target; the ID is searchable even if the renderer's anchor differs).
3. **Update** the original entry: set `**Status**: promoted`, append the promotion date and target file/section, and set `Guidance` to that location. Preserve any resolution and earlier promotion history. Future revisions follow this two-way link.

### Promotion Examples

**Learning** (verbose):
> Project uses pnpm workspaces. Attempted `npm install` but failed. 
> Lock file is `pnpm-lock.yaml`. Must use `pnpm install`.

**In TOOLS.md** (externalized after checking the retrieval path):
```markdown
## Build & Dependencies
- Before installing, read this repo's `package.json` `packageManager` field and lockfile. Use the declared manager; if missing or conflicting, consult the build instructions/maintainer before installing. Source: .learnings/LEARNINGS.md#LRN-20250115-002
```

**Learning** (verbose):
> When modifying API endpoints, must regenerate TypeScript client.
> Forgetting this causes type mismatches at runtime.

**In AGENTS.md** (actionable):
```markdown
## After API Changes
1. Regenerate client: `pnpm run generate:api`
2. Check for type errors: `pnpm tsc --noEmit`
Source: .learnings/LEARNINGS.md#LRN-20250116-001 (scope: this repo's current generator/configuration)
```

## Pattern-Key Taxonomy

`Pattern-Key` is the stable dedup and recurrence key for entries in all three
log files: keyword grep misses semantically identical but differently-worded
entries, a shared key does not — and reliable keys are what make
`Recurrence-Count` and the promotion rule work.

**Format**: `area.symptom` — exactly two levels, lowercase, hyphenated
(e.g. `deps.module-not-found`). Keep symptoms generic enough to recur: no
file names, versions, or hostnames in keys.

| Area | Scope | Example Keys |
|------|-------|--------------|
| `api` | External API/service behavior | `api.rate-limit`, `api.schema-mismatch`, `api.missing-endpoint` |
| `auth` | Credentials, tokens, scopes | `auth.token-expired`, `auth.missing-scope` |
| `build` | Compilation, bundling, CI | `build.type-error`, `build.missing-artifact` |
| `config` | Config files, env vars, settings | `config.missing-env`, `config.invalid-json` |
| `deps` | Package managers, dependencies | `deps.module-not-found`, `deps.npm-error`, `deps.version-conflict` |
| `fs` | Filesystem | `fs.no-such-file`, `fs.permission-denied` |
| `net` | Network connectivity | `net.connection-refused`, `net.timeout` |
| `runtime` | Language/runtime errors not covered above | `runtime.type-error`, `runtime.python-exception` |
| `shell` | Shell/CLI mechanics | `shell.command-not-found`, `shell.nonzero-exit` |
| `vcs` | Git and other version control | `vcs.fatal-error`, `vcs.merge-conflict` |
| `simplify` / `harden` | Code-quality patterns from the simplify-and-harden feed | `simplify.dead_code`, `harden.input_validation` |

**Rules:**

1. **Reuse before minting**: `grep -rh "Pattern-Key:" .learnings/ | sort -u` —
   a near-match beats a new key.
2. **One key per manual entry**; auto-swept OpenClaw entries may carry
   several — triage unrelated claims separately and link to the preserved sweep.
3. **Mint new areas sparingly** — only when several entries would share one.
4. **Generic sweep keys** (`runtime.error`, `runtime.failure`) mean
   "unclassified" — replace with a specific key during triage.

## Recurring Pattern Detection

If logging something similar to an existing entry:

1. **Search by key first**: `grep -n "Pattern-Key: area.symptom" .learnings/*.md`
   — this is the default dedup check and catches rewordings that keyword
   search misses
2. **Fallback keyword search**: `grep -ri "keyword" .learnings/` for entries
   logged without a key
3. **Fold, don't duplicate**: confirm the same claim and scope, not just a key
   match. For a genuinely new occurrence, bump `Recurrence-Count`, set
   `Last-Seen`, and link the evidence; review/re-reading is not recurrence
4. **Bump priority** if issue keeps recurring
5. **Consider systemic fix**: Recurring issues often indicate:
   - Missing knowledge (→ promote to `TOOLS.md` or `SOUL.md`)
   - Missing automation (→ add to `AGENTS.md`)
   - Architectural problem (→ create tech debt ticket)

## Simplify & Harden Feed

If a task supplies simplify/harden candidates, ingest them here; no other skill
is required. Manual capture uses the same recurrence and maintenance rules.

### Ingestion Workflow

1. Read `simplify_and_harden.learning_loop.candidates` from the task summary.
2. For each candidate, use `pattern_key` as the stable dedupe key.
3. Search `.learnings/LEARNINGS.md` for an existing entry with that key:
   - `grep -n "Pattern-Key: <pattern_key>" .learnings/LEARNINGS.md`
4. If found:
   - Increment `Recurrence-Count` and update `Last-Seen` only for a new occurrence of the same scoped claim
   - Add `See Also` links to related entries/tasks
5. If not found:
   - Create a new `LRN-...` entry
   - Set `Source: simplify-and-harden`
   - Set `Pattern-Key`, `Recurrence-Count: 1`, and `First-Seen`/`Last-Seen`

### Promotion Rule (System Prompt Feedback)

Consider recurring patterns for promotion when all are true:

- `Recurrence-Count >= 3`
- Seen across at least 2 distinct tasks
- Occurred within a 30-day window

These are candidate signals, not proof or expiry rules. Apply Maintenance before promotion; one-off learnings still receive maintenance without meeting these thresholds.

Promotion targets: `SOUL.md`, `TOOLS.md`, or `AGENTS.md` (workspace), or the
project's own agent file when the pattern is project-specific.

Write promoted rules as short prevention rules (what to do before/while coding),
not long incident write-ups.

## Periodic Review

Review relevant/due claims using Maintenance at natural breakpoints; not the entire log every turn:

### When to Review
- Before starting a new major task
- After completing a feature
- When working in an area with past learnings
- Weekly during active development

### Quick Status Check
```bash
# Count pending items
grep -h "Status\*\*: pending" .learnings/*.md | wc -l

# List pending high-priority items
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["

# Find learnings for a specific area
grep -l "Area\*\*: backend" .learnings/*.md
```

### Review Actions
- Resolve fixed items
- Revalidate relevant/due claims of any status, including one-off/unpromoted learnings
- Retain, revise, externalize, or retire active guidance while preserving history
- Promote supported, applicable learnings with source links
- Link related entries
- Escalate recurring issues

## Detection Triggers

Automatically log when you notice:

**Corrections** (→ learning with `correction` category):
- "No, that's not right..."
- "Actually, it should be..."
- "You're wrong about..."
- "That's outdated..."

**Feature Requests** (→ feature request):
- "Can you also..."
- "I wish you could..."
- "Is there a way to..."
- "Why can't you..."

**Knowledge Gaps** (→ learning with `knowledge_gap` category):
- User provides information you didn't know
- Documentation you referenced is outdated
- API behavior differs from your understanding

**Errors** (→ error entry):
- Command returns non-zero exit code
- Exception or stack trace
- Unexpected output or behavior
- Timeout or connection failure

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists |
| `low` | Minor inconvenience, edge case, nice-to-have |

## Area Tags

Use to filter learnings by codebase region:

| Area | Scope |
|------|-------|
| `frontend` | UI, components, client-side code |
| `backend` | API, services, server-side code |
| `infra` | CI/CD, deployment, Docker, cloud |
| `tests` | Test files, testing utilities, coverage |
| `docs` | Documentation, comments, READMEs |
| `config` | Configuration files, environment, settings |

## Best Practices

1. **Log immediately** - context is freshest right after the issue
2. **Be specific** - future agents need to understand quickly
3. **Include reproduction steps** - especially for errors
4. **Link related files** - makes fixes easier
5. **Suggest concrete fixes** - not just "investigate"
6. **Use consistent categories** - enables filtering
7. **Promote supported guidance** - validate scope and usefulness first; preserve provenance
8. **Review by cause and rate** - age alone proves neither falsehood nor uselessness

## Gitignore Options

**Keep learnings local** (per-developer):
```gitignore
.learnings/
```

This repo uses that default to avoid committing sensitive or noisy local logs by accident.

**Track learnings in repo** (team-wide):
Don't add to .gitignore - learnings become shared knowledge.

**Hybrid** (track templates, ignore entries):
```gitignore
.learnings/*.md
!.learnings/.gitkeep
```

## Upgrading & Uninstalling

Read `CHANGELOG.md` before upgrading — it carries per-version notes, and
hook changes require re-copying the hook and restarting the gateway.
To disable or remove the skill, follow `references/uninstall.md`:
`.learnings/` is user data (review before deleting), and content promoted to
`SOUL.md`/`TOOLS.md`/`AGENTS.md` stays until removed manually.

## Skill Extraction (Approval Required)

When a learning may justify a reusable skill, use [assets/SKILL-TEMPLATE.md](assets/SKILL-TEMPLATE.md). Extracting is optional, never a dependency of maintenance. Obtain explicit scoped approval before creating or modifying skill assets.

The template includes candidate criteria, helper commands, quality gates, and two-way provenance. Review the scoped claim before extraction; a resolved incident or recurrence alone is not verification. Later asset changes require their own scoped approval.
