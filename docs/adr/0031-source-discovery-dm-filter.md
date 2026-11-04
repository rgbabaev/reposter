# 0031. Filter DM chats in source discovery

## Context

Private chats can crowd the paginated source picker.

## Decision

Add a default-on “Hide DM chats” switch. The discovery API applies `hidePrivate=true` before counting and pagination. Keep the filter and discovery page in URL parameters; toggling resets the discovery page.

## Consequences

Groups, channels and topics remain visible by default. Users can include private chats without changing monitored sources or refreshing Telegram discovery. Unfiltered API requests retain their existing behavior.
