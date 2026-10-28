# 0013. Telegram reports alongside email

## Context

The operator wants match and issue reports in one configured Telegram chat, sent from the existing connected account, with original-message links and no forwarding.

## Decision

Migration 008 preserves email job IDs/history while moving delivery into a channel-aware notification queue. Commit separate jobs for each enabled channel with each match/position. Share report rendering and use an optional connector operation to compose plain-text Telegram messages. Keep Telegram types inside its adapter.

Persist long-report parts, acknowledgement progress and random IDs before calls. Reuse IDs on retry; an in-flight duplicate-ID response is uncertain, not acceptance. Pace reports and honor account wait states. Temporary failures back off; permanent match failures require manual retry, while incident alerts stay pending without recursive alerts. Known generated report IDs are ignored by matching. Jobs use the currently configured recipient when sending, consistent with email.

## Consequences

No new dependency or Telegram login is needed. Email and Telegram fail independently, but Telegram cannot report its account outage until reconnecting. Existing matches are not replayed when enabling reports. Changing recipients redirects pending parts without replaying acknowledged parts. SMTP remains at least once; Telegram request IDs improve deduplication without claiming exactly-once delivery. Operators must restart and verify channel posting rights and original links.

Reference: [Telegram update mapping and random-ID deduplication](https://core.telegram.org/api/updates).
