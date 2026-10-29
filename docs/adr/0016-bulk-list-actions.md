# 0016. Opt-in bulk list actions

## Context

The operator needs to manage several records without opening each individually.

## Decision

Use a shared, opt-in Select mode on entity lists. Use a native checkbox label covering each tile during Select mode so tile clicks toggle selection and cannot reach underlying controls. Position checkboxes inside cards with permanently reserved heading space and use a floating bulk toolbar to avoid moving list content. Select page affects only the visible page; changing pages or activity views clears selection. Execute existing authenticated entity operations sequentially, confirm destructive actions once, report partial results and exit Select mode after completion, including partial failures. Offer only applicable actions and display their eligible counts.

Allow deletion of completed publication history, accepted delivery records, and informational or resolved activity without pending alerts. Retain unfinished runs, open incidents and unsent notifications. Store deleted Telegram report IDs separately so deleting history cannot cause report feedback loops. Schedule replacement message IDs remain on schedules.

## Consequences

Batches are not atomic; successful operations remain applied when another item fails. Existing domain validation and source serialization still apply. External discovery and dashboard summaries are not deletable entity lists. Deleted report identities retain only opaque IDs.
