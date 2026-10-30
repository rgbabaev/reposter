# 0022: Preserve hourly publication intervals

Interval timing is superseded by [ADR 0025](0025-publication-based-intervals.md).

## Context

Daily schedules cannot publish several times a day. Hour intervals must remain consistent across midnight, downtime and slow publications.

## Decision

Add an hourly recurrence with a whole-number interval from 1 to 24. Store it in the existing calendar JSON without a migration. Start the first run one interval after creation or a recurrence change. Use the persisted next occurrence as the interval anchor when queueing and completing scheduled runs, advancing to the first future occurrence without replaying missed intervals.

## Consequences

Intervals need not divide 24. Restart and pause preserve cadence; Run Now and unrelated edits preserve the next occurrence. Existing calendar schedules and publication replacement behavior remain compatible.
