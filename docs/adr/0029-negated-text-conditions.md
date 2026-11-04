# 0029. Negated text conditions

## Context

Rules need to exclude unwanted words, phrases and hashtags while retaining existing required conditions and historical matches.

## Decision

Add an optional boolean `negated` to each text condition in the existing JSON storage. Missing or false means required; true inverts that condition's text match. All conditions must pass, so any matching exclusion blocks its rule. Other rules remain independent.

Use the same normalization, boundaries and literal matching for both forms. Keep 1–20 total conditions and require at least one positive condition. Group exclusions separately in the editor and prefix their derived headings with NOT.

## Consequences

No migration or new dependency is needed. Existing rules and historical snapshots keep their behavior and content. Deploy the updated server and client together; old clients do not understand negation. Rules are evaluated at processing time, including recovery and combined albums.
