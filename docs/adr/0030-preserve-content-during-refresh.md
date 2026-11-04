# 0030. Preserve content during refresh

## Context

Action-triggered refreshes clear loaded data, briefly collapsing lists and details. The browser clamps scrolling to the shortened page, making rule toggles and other actions jump upward.

## Decision

Track the requested path with remote data. Keep successful data mounted while refreshing that same path, including polling, and show refresh errors alongside it. Show a loading state when no data is available or the path changes. Continue cancelling obsolete requests and ignoring their results.

## Consequences

Sources, rules, posts, schedules, matches, activity and publication history share the fix. Filters, pagination and view changes load their own data. Navigation and actual content changes retain their existing scrolling behavior. No new dependency is required.
