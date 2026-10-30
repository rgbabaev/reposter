# 0019. Shared modal dialog

Superseded in part by [ADR 0020](0020-web-awesome-components.md): shared dialog ownership remains, using Web Awesome.

## Context

Match filters and enlarged image previews duplicate native dialog lifecycle and page scroll locking.

## Decision

Use a shared `Dialog` component, mounted while open. It owns `showModal`, cleanup, scroll locking, accessible naming and optional backdrop dismissal. Native dialog behavior handles focus containment, Escape and focus restoration. Callers provide content, styling, close state and optional keyboard controls.

## Consequences

Both dialogs share lifecycle behavior without a new dependency. Image zoom/navigation and filter application remain in their respective views.
