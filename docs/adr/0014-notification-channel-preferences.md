# 0014. Persistent notification channel switches

## Context

The operator needs to turn email and Telegram notifications on or off without editing credentials or restarting for each change.

## Decision

Store per-channel switches in SQLite with defaults preserving current delivery. Expose partial boolean updates through the authenticated, origin-checked Settings API. Telegram also requires its existing file-level setup. Check switches both when queuing notifications and before each worker send. Reject manual retry while its channel is off.

## Consequences

Changes apply immediately and survive restart. Off suppresses new jobs and holds pending jobs; on resumes pending work without replaying skipped matches. An in-flight send may finish. Both channels may be off without stopping match processing or incident recording. Credentials, recipients and destination changes remain protected-file operations.
