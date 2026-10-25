# 0003: Cancel provider work before closing storage

## Context

Disconnecting GramJS can leave RPC promises pending. Monitoring then cannot drain, and error handlers can outlive the processing queue and access closed storage.

## Decision

Race Telegram operations and iterator reads against connector shutdown. Stop accepting provider callbacks, drain monitoring error handlers, and then close SQLite. Treat shutdown cancellation as expected. Report unfinished components when the shutdown deadline expires.

## Consequences

Unfinished recovery retains durable positions and buffers for restart. Cancellation releases application callers; GramJS destruction still closes provider connections. The process retains its 45-second shutdown deadline.
