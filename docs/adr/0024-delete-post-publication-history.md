# 0024. Delete publication history with its post

## Context

Publication history and soft-deleted schedule references prevent deletion of otherwise unused posts.

## Decision

Delete a post, its publication runs, uploaded images and referencing deleted schedule rows in one storage transaction. Reject existing schedules, including paused ones, and queued, running or uncertain runs. Detach other posts' history from deleted schedule rows before removing those rows. Preserve live schedules and their replacement tracking.

## Consequences

Completed and failed history no longer blocks post deletion. Telegram messages remain. No schema migration is required. This revises historical reference retention in ADRs 0004 and 0008 and permits failed history removal when deleting its post.
