# 0027. Filter matches by saved source names

## Context

Matches retain source names after sources change or are removed. Existing snapshots do not identify forum topics separately.

## Decision

Extend the match filter dialog with multiple source choices from all stored snapshots. Match any selected exact source name and combine source, text and rule filters before counting and pagination.

## Consequences

Historical sources remain selectable without a migration. Identical source names share a filter; renamed sources retain separate historical choices.
