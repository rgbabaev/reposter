# 0008: Edit schedules while preserving publication ownership

## Context

A schedule can move destinations after publishing. Replacement must delete the original messages at their original destination. Deletion must preserve posts and publication history.

## Decision

Persist the previous destination with tracked message IDs on schedules and run snapshots. Use that destination for deletion and the current destination for publication. Keep remaining original IDs and destination after cancellation.

Edit and delete schedules in synchronous storage transactions, rejecting queued, running, failed or uncertain runs. These transactions serialize with run creation. Preserve pause state and recurring time unless recurrence changes.

Soft-delete schedules, pause them and exclude them from reads and scheduling. Keep their rows for publication-history references; never delete Telegram messages as part of schedule deletion.

Show the blocking run state on schedule cards. Offer confirmed cancellation of queued/failed runs there using the existing publication operation; running and uncertain runs retain their restrictions.

## Consequences

Destination changes survive restart and repeated edits. Deleted schedules cannot resume through the API. Historical schedules retain their post references. Operators cancel queued/failed runs from their schedule or history, and review uncertain results in history before editing or deleting.
