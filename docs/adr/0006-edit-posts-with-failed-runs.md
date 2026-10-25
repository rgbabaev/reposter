# 0006: Let failed runs retain images without locking post edits

## Context

Historical failed runs blocked edits even after later publication succeeded. Simply removing that lock would delete images still needed by failed-run snapshots.

## Decision

Failed runs no longer lock the reusable post. Distinguish currently selected images from retained snapshot images. Editing updates the current selection and preserves images referenced by unfinished runs. Retrying uses the original snapshot; new publications use the edited post. Remove unselected images when no unfinished run references them.

Queued, running and uncertain runs continue to lock edits.

## Consequences

Existing images remain selected during migration. Failed runs can be retried after a post changes, including after restart. Retained images consume storage until the referencing runs finish or are cancelled.
