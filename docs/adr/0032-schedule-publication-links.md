# 0032. Show current publication links in schedules

## Context

Schedules retain message IDs and their original destination for replacement, but expose no links in the UI.

## Decision

Derive current publication messages from retained schedule IDs and unfinished-run checkpoints. Omit acknowledged deletions and show acknowledged sends awaiting review. Let each connector generate optional message URLs; Telegram uses [group/topic links](https://core.telegram.org/api/links#message-links) and leaves basic-group links unavailable.

## Consequences

Schedule cards link every recorded message, including album items. Links keep their original destination after schedule edits and survive history deletion. No migration or provider request is needed. External deletions and access changes are not detected.
