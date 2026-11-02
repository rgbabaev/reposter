# 0028. Store applied filters in the URL

## Context

Local filter state disappears on reload and cannot be shared. Activity links already use a view parameter.

## Decision

Use a shared native URL hook for applied match filters, Activity views and their pagination. Encode text as `text`, repeat `rule` and `source` for multiple choices, and use `view` and `page` for list state. Replace the current history entry, preserving unrelated parameters, fragments and history state. Read changes on browser navigation. Keep modal drafts local until Apply; Apply/Clear and view changes reset the page.

## Consequences

Reloaded and shared links restore the list without adding history entries for filter changes. Default values are omitted when updating parameters. No dependency or server change is required.
