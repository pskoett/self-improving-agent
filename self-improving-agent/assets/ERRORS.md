# Errors Log

Command failures, exceptions, and unexpected behaviors.

## Entry Template

Copy and fill in this entry. Keep the incident separate from any reusable fix; resolution is not timeless verification. For mixed session sweeps, classify individual claims during triage, not from regex-derived Pattern-Keys. Preserve and link the original sweep, including false positives marked as such.

````markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 timestamp
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
Brief description of what failed

### Error
```
Short redacted error excerpt
```

### Context
- Command/operation attempted
- Input and environment relevant to reproduction (no secrets or raw transcripts)

### Suggested Fix
Candidate fix, explicitly unverified unless tested

### Metadata
- Reproducible: yes | no | unknown
- Related Files: path/to/file.ext
- See Also: related entry ID, if any
- Pattern-Key: area.symptom
- Recurrence-Count: 1
- First-Seen: YYYY-MM-DD
- Last-Seen: YYYY-MM-DD

### Maintenance
- Claim: unknown — identify the reusable inference/instruction during triage
- Scope: unknown
- Authority: unknown
- Decay: unknown / unknown
- Revalidate: before relying on the claim, establish scope/authority and choose the cause-specific check and trigger
- Validation: pending
- Evidence: none yet
- Disposition: retain — provisional, not validated
- Guidance: none

---
````

Use the skill's Maintenance instructions for type/rate, actual dated evidence, and retain/revise/externalize/retire outcomes. Unavailable/conflicting evidence stays unresolved. Preserve resolution and review history; reviews are not new occurrences. Initialize legacy entries only when relevant, without bulk migration.

---
