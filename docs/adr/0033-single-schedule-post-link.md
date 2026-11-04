# 0033. Show one schedule link per post

## Context

Schedule cards show a separate link for each message in a composite post.

## Decision

Replace ADR 0032's per-message display with one “Open post” link using the first available current message URL. Keep every message ID in storage and API responses for replacement and recovery. Show one unavailable label if no URL exists.

## Consequences

Existing albums immediately show one link. Original destinations and deletion checkpoints still determine the linked message. No migration or provider request is required.
