# 0009. Post formatting and derived headings

## Context

Posts need Telegram formatting and image ordering. Posts, rules and schedules must no longer require editable names. Existing relationships and historical delivery/publication snapshots must survive the upgrade.

## Decision

Store provider-independent formatting entities with UTF-16 offsets alongside plain text. Validate ranges, nesting, character boundaries and link protocols; translate entities only inside the Telegram adapter. Save image order through existing ordinals. Publication snapshots retain entities and ordered image IDs; legacy snapshots default to no formatting.

Migration 007 drops entity name columns without rebuilding relationships. Shared pure functions derive headings from post content, rule conditions and schedule properties. New match/publication snapshots capture derived headings; legacy snapshots retain their original names.

## Consequences

No formatting parser or runtime dependency is needed. The editor exposes explicit text ranges and keyboard/touch image-order controls. Edits shift unaffected ranges, resize containing ranges and remove ranges partly overwritten. Invalid overlapping styles are rejected. Image content remains immutable while retained runs reference it. Names cannot be restored from current entities after migration; historical snapshots remain unchanged.
