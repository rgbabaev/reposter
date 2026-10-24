# 0001: Pace Telegram history recovery

Date: 2026-10-24
Status: Accepted

## Context

GramJS history pacing produces negative timeout warnings and uses incorrect timer units.

## Decision

Recover in ascending pages of 100 messages. Disable GramJS pacing and space page starts by one second using a monotonic clock.

## Consequences

Recovery retains its saved position and upper bound without patching dependencies. Pagination and pacing are maintained inside the Telegram adapter.
