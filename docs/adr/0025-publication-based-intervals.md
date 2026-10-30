# 0025. Count intervals from successful publication

## Context

Changing a schedule to six hours postponed its next run despite an earlier successful publication. The operator expects the interval to start from the last successful publication.

## Decision

Persist `last_published_at` on each schedule independently of history. Successful scheduled, manual, retried and reviewed publications restart hourly intervals from completion. Interval changes use that saved time; before the first publication, count from creation or the recurrence change. Calendar recurrence keeps its existing behavior.

Migration 012 backfills the timestamp from retained successful history and corrects hourly due times, excluding deleted schedules and unfinished runs. Recovery publishes once when overdue, then waits the full interval after success.

## Consequences

Run Now and slow publications shift hourly times. Deleting history preserves interval timing. Paused schedules stay paused, failures still require resolution, and published-message replacement remains schedule-scoped. This supersedes fixed hourly cadence in ADR 0022.
