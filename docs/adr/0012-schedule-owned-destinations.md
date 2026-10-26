# 0012. Schedule-owned destinations

## Context

The direct-publication form on post cards makes the destination look like a post property. Schedules already link reusable content to its destination and recurrence.

## Decision

Remove destination selection and direct publication from Posts. Add a Create schedule link that preselects the post. Choose destinations in Schedules and use Run Now for immediate publication. Keep existing publication APIs and history compatible.

## Consequences

Posts needs no source lookup. One post can still serve multiple destinations through separate schedules. Existing data and publication snapshots need no migration.
