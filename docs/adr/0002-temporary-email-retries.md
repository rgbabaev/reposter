# 0002: Keep temporary email failures retryable

## Context

A ten-attempt limit left match emails failed after long SMTP outages, preventing automatic delivery when service recovered.

## Decision

Keep temporary failures pending without an attempt limit. Preserve increasing delays capped at one hour and attempt counts across restart. Permanent match-email failures require manual retry; incident alerts remain pending.

## Consequences

Long outages recover automatically. Existing failed jobs still require manual retry. Delivery remains at least once with stable Message-IDs.
