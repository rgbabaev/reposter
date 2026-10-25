# 0005: Preserve UTC calendar recurrence

## Context

Monthly recurrence must preserve the original day after short months. Downtime must not replay every missed interval, and Run Now must not move recurring times.

## Decision

Store the original UTC calendar fields and next occurrence. Queue one overdue run per schedule; compute its next future occurrence after completion. Use a distinct manual trigger that preserves the recurring time. Serialize runs with a database constraint and one publication worker. Persist pause state and leave queued recurring work paused across restart.

## Consequences

Day 31 clamps in February and returns to day 31 in March. Slow runs and downtime combine missed intervals. Run Now is available while paused without resuming recurrence. Uncertain or failed runs block further schedule runs until reviewed, retried or cancelled.
