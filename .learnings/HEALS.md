# Verified recoveries

## [HEAL-20261022-001] clawhub-owner-disambiguation

**Logged**: 2026-10-22T08:41:47Z
**Status**: verified
**Trigger**: external-change
**Area**: registry
**Priority**: low

### Failure
Reading `/api/v1/skills/self-improving-agent` returned HTTP 409 with code
`AMBIGUOUS_SKILL_SLUG`. Encoding `@pskoett/self-improving-agent` as a single
path component returned HTTP 404.

### Diagnosis
Multiple publishers have this slug. OpenClaw 2026.10.4's installed
`fetchClawHubSkillDetail` implementation passes the slug in the path and
`ownerHandle` as a query parameter, rather than embedding the owner in the path.

### Fix
Use `https://clawhub.ai/api/v1/skills/self-improving-agent?ownerHandle=pskoett`.
The version-detail endpoint accepts the same query parameter.

### Verification
Both owner-qualified requests succeeded with `curl -fsSL` on 2026-10-22.
Detail returned owner `pskoett` and latest version `4.0.3`; version detail
returned file hashes matching the local SKILL.md, CHANGELOG.md, and
references/maintenance-evals.md. Recheck the client contract if the API changes.

### Metadata
- Pattern-Key: api.clawhub_owner_disambiguation
- Recurrence-Count: 1
- First-Seen / Last-Seen: 2026-10-22
- See Also: https://ampcode.com/threads/T-01a162bd-e855-72f4-85d8-36301774559a

---

## [HEAL-20261022-002] stopped-adhoc-service-definition

**Logged**: 2026-10-22T09:34:00Z
**Status**: verified
**Trigger**: tool-failure
**Area**: validation
**Priority**: low

### Failure
After `amp orb service stop sia-proof-gateway`, `service restart` exited 1:
the ad-hoc service had no saved definition and was not declared in services.yaml.

### Diagnosis
In this orb, stopping the ad-hoc service removed its saved start specification.
The state/config and installed hook remained intact; service list showed only
the separate model fixture still running.

### Fix
Recreated the service with `amp orb service start sia-proof-gateway --command`
and the original isolated environment plus `openclaw gateway run`. Waited for
readiness instead of changing the gateway configuration or repeating restart.

### Verification
The restarted gateway's public `health` RPC returned `ok: true`. Final live
capture, compressed-event, clean-session and opt-out cases all passed on
2026-10-22; outputs are in `.amp/in/artifacts/openclaw-live-proof.jsonl`.
This is an observed CLI lifecycle behavior, not a guarantee for later versions.

### Metadata
- Pattern-Key: env.amp_stopped_adhoc_service
- Recurrence-Count: 1
- First-Seen / Last-Seen: 2026-10-22

---
