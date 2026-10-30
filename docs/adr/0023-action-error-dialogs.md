# 0023. Action error dialogs

## Context

Inline action errors can be missed inside cards or long pages, including post deletion restrictions.

## Decision

Show action failures through a shared `ErrorDialog` using the existing dialog lifecycle. Close and Escape clear the error. Bulk failures include result counts and distinct failure messages. Keep loading errors inline with retry controls.

## Consequences

Action failures receive focus and require dismissal. Forms retain their values, and independent bulk operations still finish before reporting failures. No API or storage changes are needed.
