# 0018. Filter matches using stored snapshots

## Context

Historical matches preserve rule headings without stable rule IDs. Rules can change or be deleted.

## Decision

Filter by literal, NFC-normalized, case-insensitive message text and one or more exact saved rule headings, matching any selected heading. Combine filters before counting and pagination. Populate rule choices from all stored matches. Use a deterministic SQLite text-normalization function for Unicode support.

## Consequences

Historical headings remain selectable; identical headings share a filter. No migration or replay is needed. Text filtering scans stored snapshots.
