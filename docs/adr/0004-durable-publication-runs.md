# 0004: Persist publication runs and require uncertain-result review

## Context

Telegram sends and SQLite commits cannot form one transaction. Retrying an interrupted send can duplicate a post; replacement must delete only tracked system messages.

## Decision

Store posts, image bytes, destination snapshots, random request IDs, every returned message ID and deletion checkpoints in SQLite. Serialize publication work in one worker. Persist run state before external calls. Resume deletion idempotently; convert interrupted sends to uncertain runs that block the schedule.

Reconcile uncertain results through explicit operator confirmation. Verify supplied IDs against outgoing messages, destination, time, text and album metadata. Never infer ownership from a text search or automatically resend an uncertain publication. Retain known partial results for the next replacement.

Failures before sending and explicit Telegram client-error rejections are failed runs with manual retry. Connection loss, server errors, duplicate request IDs and incomplete response mappings remain uncertain. Preserve allowlisted provider error codes through review without logging provider messages or post bodies. Basic groups omit the alternate-sender field; supergroups explicitly select the personal account.

## Consequences

Stopped-process database backups include uploaded images. Queued, running and uncertain runs lock post edits. Failed runs retain their original images without locking the reusable post; see [ADR 0006](0006-edit-posts-with-failed-runs.md). Operators must review ambiguous sends; failed or queued runs can be retried or cancelled. Past publication records retain their post references. Provider acceptance still requires live checks.
