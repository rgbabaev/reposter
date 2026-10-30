# 0026. Action result toasts

## Context

Bulk results appear as plain text below list controls. Individual deletions have no confirmation after completing or navigating away.

## Decision

Use one lazily mounted Web Awesome `wa-toast` in the document body, shared through `showToast`. Display individual deletion confirmations and one summary per bulk action at the top end. Successes dismiss after five seconds; partial and total failure summaries remain until dismissed. Preserve the action error dialogs from ADR 0023 for counts and deduplicated failure details. Use the component's plain-text `create()` API, announcements and dismissal behavior.

## Consequences

Results survive page navigation and list refreshes. Web Awesome owns stacking, timers, hover/focus pausing and cleanup. No dependency or API changes are required.
