# 0017. Reusable entity list

## Context

Entity pages share selection behavior but duplicate list states and pagination. Future filters and view settings will vary by entity.

## Decision

Use a generic `EntityList` component for selection, bulk actions, loading, errors, empty states, pagination and page clamping. Pages provide paginated data, refresh/page callbacks, selection scope, action definitions, accessible item labels, card rendering and empty-state text. Keep fetching and domain operations in pages. Use the same item wrapper for every entity.

Filters and list/tile settings remain future work; add their per-use configuration to this component when implemented.

## Consequences

Sources, rules, posts, schedules, matches, activity events and notification delivery share one list boundary. Domain-specific cards remain independent. Discovery and dashboard summaries retain their existing presentation.
