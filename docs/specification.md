# Personal Monitoring System

Date: 2026-10-21. Status: agreed scope; implementation choices are specified below.

## 1. Scope

| Phase | Functions |
| --- | --- |
| Release 1 | Telegram monitoring, rules, stored matches, immediate email, web UI, CLI connection setup |
| Phase 2 | Scheduled publication and deletion |
| Later | More accounts and users; website connectors, including list.am and myhome.ge |

Support one user and one Telegram account in Release 1. Design for approximately 50 sources and thousands of incoming messages per day. Phase 2 must support tens of schedules.

## 2. Stack and structure

Use TypeScript, ESM, Node.js 24 LTS, and npm workspaces. Pin the supported Node.js patch version and package versions during implementation.

| Directory | Responsibility |
| --- | --- |
| `server/` | HTTP API, authentication, application services, SQLite, workers, connector adapters, CLI |
| `client/` | Preact UI, Vite build, plain CSS |
| `shared/` | API types and source-independent data types; no runtime dependencies |

Use `node:http`, `node:crypto`, and `node:sqlite`. Use SQL migrations and prepared statements. Do not add an ORM. Keep database calls short. The SQLite API is a release candidate in Node.js 24; keep it behind a small storage module.

Use GramJS for Telegram and Nodemailer for SMTP. Select a small QR-code encoder for CLI setup. These are justified dependencies. GramJS has dependencies of its own. Prefer packages without runtime dependencies for other needs. Record the purpose of each direct dependency. Use npm lockfiles and `npm ci`.

Use native browser APIs for requests and navigation. Do not add a UI kit, state library, message broker, plugin loader, or separate scheduler service.

## 3. Connector boundary

Core services must not import GramJS types. Each connector must provide its own authentication, source discovery, incoming events, recovery, and provider errors.

Use these common operations: `listSources`, `start`, `stop`, and `recover`. Report capabilities for history, topics, attachment metadata, publication, and deletion. Add publication operations in Phase 2. Do not require every connector to support every operation.

Each incoming item must contain a connector account ID, external source ID, external item ID, event time, text, sender, optional URL, and attachment metadata. Keep external IDs as strings. Keep provider-specific state inside the adapter. Use a stable item identity for duplicate detection.

Store account and owner references now. Enforce one active account and one owner in Release 1. Do not build account switching or user management yet.

## 4. Telegram setup and sources

Run CLI setup with a QR code. Refresh expired QR codes. Request the two-step verification password when required. Do not store that password. Save the authorized session outside the repository with owner-only file permissions.

The operator must obtain `api_id` and `api_hash` from `my.telegram.org`. QR login does not remove this requirement. The web UI must show connection status and CLI reconnect instructions. Telegram login through the UI is out of scope.

List accessible groups, channels, private chats, and forum topics. Let the user select, enable, disable, and remove monitored sources. Refresh the source list on request. Source removal must retain stored matches. A whole forum and one of its topics must not produce duplicate notifications for the same item.

On first enable, save the current source position. Exclude earlier messages. On re-enable, start from a new position; exclude the disabled period. After a service or network outage, recover all available items after the saved position. Recovery has no age limit. Report lost access or unavailable history. Do not promise recovery of deleted or inaccessible messages.

Ignore message edits and deletion events. Inspect message text and captions. Read attachment types from metadata. Do not download or inspect media content in Release 1.

## 5. Rules and matches

Rules are reusable across sources. A rule can be assigned to several sources, and each source can have several rules. Each rule has one name, enabled state, set of text conditions, and optional attachment-type condition shared by all its assignments. Editing or disabling a rule affects every assigned source. Source enable/disable remains independent; disabled sources do not match even when their rules are enabled.

An enabled rule must have at least one assigned source. Removing a source removes its assignments while preserving rules and stored matches. If a rule loses its last source, retain it as disabled and unassigned so it can be reassigned. Changing assignments does not reset source positions or reprocess completed items; recovery continues to use assignments and rules active at processing time. Evaluate a shared rule once per item even when both a forum and its topic are assigned.

During this development-stage upgrade, drop existing rules and create the new rule/assignment structure without backfilling old rules. Rules must be recreated manually. Preserve sources, processing positions and historical match/email snapshots. See [ADR 0007](adr/0007-shared-monitoring-rules.md). Migration 005 implements this change; recreate rules after upgrading.

All conditions in one rule must pass. Any enabled rule can produce a match. Do not provide nested logic, explicit OR groups, NOT conditions, regular expressions, or AI in Release 1.

Support word parts, complete words, exact phrases, and hashtags. Normalize text to Unicode NFC. Ignore letter case. Use Unicode letter and number boundaries for complete words. Match phrases as contiguous text after normalization. Match hashtags as complete tags; accept input with or without `#`. Do not translate, stem words, or change accents.

The image condition is optional. Without an attachment condition, matching text is sufficient. With an image condition, matching text and at least one image are required. Permit selection of other metadata attachment types. A rule must contain at least one non-empty text condition.

Example: rule A requires `apartment` and `rent`. Rule B requires `#housing`. Either rule can match. If both match, create one notification and record both rules.

Treat a media album as one item. Combine its text and attachment metadata before evaluation. Use a bounded collection delay. Persist incomplete album state for restart recovery. Do not create one notification per image.

Store one notification per account, external source, and item identity. Store the source name, available sender details, text, source URL, message time, match time, and matched rule names. Preserve snapshots when a source or rule changes. If a sender or URL is unavailable, label it as unavailable.

Evaluate recovered items with the rules active at processing time. Do not reprocess stored matches when rules change. Discard unmatched content after processing, except temporary recovery state. Keep matched content until the user deletes it.

## 6. Storage, recovery, and email

Use one SQLite database with foreign keys, WAL mode, and versioned migrations. Store accounts, sources, rules, recovery positions, incomplete albums, matches, email jobs, UI sessions, and activity events.

Commit each match, its email job, and the completed processing position in one transaction. Advance positions for unmatched items too. Do not advance beyond an incomplete item. Merge live events and recovery results through the same duplicate checks. Keep recovery ordered per source.

Send email immediately after commit. Each message must contain the source, sender, text, matched rules, and source link when available. Use SMTP with TLS. Escape all untrusted HTML. Do not attach images.

The email worker must resume pending jobs after restart. Store attempt count, next attempt time, and last error. Retry temporary failures with increasing delays, capped at one hour. Keep failed jobs for manual retry. SMTP acceptance marks a job as sent; inbox delivery is outside the system's control.

Database notifications must be unique. SMTP delivery is at least once: an uncertain send result can cause a duplicate email. Use a stable email Message-ID. Do not claim exactly-once email delivery.

Record all operational errors. Email each incident. Group repeated errors from the same incident; retain their occurrence counts. Keep email failure alerts pending until SMTP works. Do not create recursive alerts about failed alert emails. Write errors to stderr if the database fails. A stopped process cannot send its own failure alert.

Delete activity events after 30 days. Retain open incidents and pending delivery jobs. Keep secret values and message bodies out of operational logs.

## 7. Web UI and access

Use English, a light theme, native-style controls, clear spacing, and iOS-style navigation. Design for mobile screens first. Support Safari and Chromium. Use semantic HTML, visible focus, labelled fields, and touch targets of at least 44 CSS pixels. Do not add PWA support, dark mode, or decorative blur effects.

Release 1 pages: Dashboard, Sources, Rules, Matched Messages, Connectors, Activity Log, and Settings. Add Posts and Schedules in Phase 2. Use bottom navigation for frequent actions and a More page for other pages. Show loading, empty, error, and disconnected states.

Show recent matches in pages, newest first. Provide match details and manual deletion. Deletion must not remove Telegram content or cancel an email already queued. Search, read status, bookmarks, archives, and rule testing are later work.

Read the access password from a protected configuration file. Do not send it to the client build. Use random session tokens; store token hashes on the server. Sessions expire after seven days. Provide logout. Use HttpOnly, SameSite cookies and Secure cookies with HTTPS. Check request origin for writes. Limit login attempts and request sizes. Return only safe settings through the API.

Serve the UI and JSON API from one origin. Use HTTPS behind a reverse proxy on a VPS. Permit HTTP on loopback for local use. Trust proxy headers only from configured proxies. Use authenticated, paginated API routes for sources, rules, matches, activity, connector status, and safe settings. Poll status while the UI is visible.

## 8. Configuration and operation

File-only settings: password, bind address, public origin, trusted proxy settings, database and session paths, Telegram credentials, SMTP settings, sender, and recipient. UI settings: source selection, rules, and later posts and schedules. Restart the process after file configuration changes.

Run one application process. Start recovery and email workers without browser access. Support graceful shutdown and bounded connector retries. Respect Telegram wait responses. Provide a health endpoint without secret values. Use UTC for storage and display. Label displayed times as UTC.

Support a regular Node.js process and an optional container. Store the database and session on a persistent local volume. Do not run two instances against the same data directory. Basic backup is an operator action: stop the process and copy the data directory. Automated backup and restore are later work.

## 9. Phase 2: publication

Create a reusable post in the UI with plain text and uploaded images. Publish from the personal account to one group or forum topic per schedule. Import from existing Telegram messages is later work.

Planned in task 18: add Telegram-supported text formatting and attached-image ordering in the post editor. Preserve formatting and image order when saving, reopening and publishing posts, including captions, schedules and retry snapshots.

Support daily, weekly, and monthly calendar schedules in UTC. Repeat one post. Clamp an unavailable monthly day to the month's last day. Preserve the original day for later months. Provide Pause, Resume, and Run Now. Run Now must not shift the recurring schedule.

Schedules support editing their name, post, destination and UTC recurrence. Preserve pause state; recompute the next run only when recurrence changes. Retain previous message IDs and their original destination when changing destinations. Confirm schedule deletion; stop future runs while retaining its post, Telegram messages and publication history. Block edits and deletion while a run is queued, running, failed or uncertain; resolve it through publication history first. Serialize these actions with run creation.

Before publication, delete the previous publication from that schedule. Delete only system-created messages. Store every sent message ID, including album items. If deletion fails, stop that run and report the error. Treat an already deleted message as success.

After downtime, run one overdue publication immediately. Do not replay every missed interval. Then resume the original calendar schedule. Serialize runs per schedule. Paused schedules must not run during restart. Store run state before external calls. Reconcile uncertain publication results before retrying.

## 10. Completion and deferred work

Release 1 is complete when CLI connection setup, source selection, matching, stored notifications, and email delivery work together. Verify restart recovery, duplicate handling, optional image conditions, and mobile access manually. Automated tests and CI are not required for this release.

Defer multiple users/accounts, website adapters, nested rules, media analysis, rule tests against recent messages, notification rate limits, digests, search, configuration export/import, and session encryption at rest. Retain the connector and ownership boundaries for these changes.

## Reference documentation

- [Telegram application credentials](https://core.telegram.org/api/obtaining_api_id)
- [Telegram QR login](https://core.telegram.org/api/qr-login)
- [GramJS client](https://gram.js.org/beta/classes/TelegramClient.html)
- [Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Preact](https://preactjs.com/)
- [Nodemailer](https://nodemailer.com/)
