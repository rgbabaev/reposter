# 0007: Share monitoring rules across sources

Status: Implemented in migration 005 and task 17.

## Context

A rule currently belongs to one source. Applying the same conditions to several groups requires duplicate rules that must be maintained separately.

## Decision

Make rules owner-scoped entities with a many-to-many `rule_sources` relationship. Expose `sourceIds` in the API and a source checklist in the editor. Each rule keeps one condition set and one enabled flag across all assignments. Source enablement remains independent.

Require an assignment to enable a rule. Source removal deletes only its assignments; losing the last assignment disables and retains the rule. Rule deletion removes its assignments without changing sources or historical match snapshots.

Evaluate a rule once per item across eligible assignments, including forum/topic overlap. Assignment changes do not reset processing positions or replay completed messages. Recovery uses current assignments, consistent with current-rule evaluation.

For this development-stage upgrade, drop existing rules and create the new rule/assignment structure in a versioned schema upgrade. Do not backfill old rules. Preserve sources, processing positions and historical match/email snapshots.

## Consequences

Existing rules must be recreated manually. One edit updates matching across every assigned source. Source-specific variants still require separate rules. Deploy the updated API and UI together. Update match-source selection to use the incoming source and matching assignments rather than a rule's former single source.
