# Personal Monitoring System

Date: 2026-10-21. Status: agreed scope; implementation choices are specified below.

## 1. Scope

| Phase | Functions |
| --- | --- |
| Release 1 | Telegram monitoring, rules, stored matches, immediate email and optional Telegram reports, web UI, CLI connection setup |
| Phase 2 | Scheduled publication and deletion |
| Later | More accounts and users; website connectors, including list.am and myhome.ge |

Support one user and one Telegram account in Release 1. Design for approximately 50 sources and thousands of incoming messages per day. Phase 2 must support tens of schedules.

## 2. Stack and structure

Use TypeScript, ESM, Node.js 24 LTS, and npm workspaces. Pin the supported Node.js patch version and package versions during implementation.

| Directory | Responsibility |
| --- | --- |
| `server/` | HTTP API, authentication, application services, SQLite, workers, connector adapters, CLI |
| `client/` | Preact UI, Web Awesome components, Vite build, plain CSS |
| `shared/` | API types and source-independent data types; no runtime dependencies |

Use `node:http`, `node:crypto`, and `node:sqlite`. Use SQL migrations and prepared statements. Do not add an ORM. Keep database calls short. The SQLite API is a release candidate in Node.js 24; keep it behind a small storage module.

Use GramJS for Telegram and Nodemailer for SMTP. Select a small QR-code encoder for CLI setup. These are justified dependencies. GramJS has dependencies of its own. Prefer packages without runtime dependencies for other needs. Record the purpose of each direct dependency. Use npm lockfiles and `npm ci`.

Use native browser APIs for requests and navigation. Use the free Web Awesome custom elements directly with Preact, without React compatibility. Bundle components and theme assets locally. Retain native file upload and the custom Telegram rich text editor. Do not add a state library, message broker, plugin loader, or separate scheduler service.

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

Ignore message edits and deletion events. Inspect message text and captions. Read attachment types from metadata without downloading media during monitoring or rule evaluation. For the web UI, download matched image previews and enlarged images on demand; do not analyze their content.

## 5. Rules and matches

Rules are reusable across sources. A rule can be assigned to several sources, and each source can have several rules. Each rule has an enabled state, text conditions, and optional attachment-type condition shared by all its assignments. Rules, posts and schedules have no editable name; derive headings from their properties. Editing or disabling a rule affects every assigned source. Source enable/disable remains independent; disabled sources do not match even when their rules are enabled.

An enabled rule must have at least one assigned source. Removing a source removes its assignments while preserving rules and stored matches. If a rule loses its last source, retain it as disabled and unassigned so it can be reassigned. Changing assignments does not reset source positions or reprocess completed items; recovery continues to use assignments and rules active at processing time. Evaluate a shared rule once per item even when both a forum and its topic are assigned.

During this development-stage upgrade, drop existing rules and create the new rule/assignment structure without backfilling old rules. Rules must be recreated manually. Preserve sources, processing positions and historical match/email snapshots. See [ADR 0007](adr/0007-shared-monitoring-rules.md). Migration 005 implements this change; recreate rules after upgrading.

All conditions in one rule must pass. Any enabled rule can produce a match. Do not provide nested logic, explicit OR groups, NOT conditions, regular expressions, or AI in Release 1.

Support word parts, complete words, exact phrases, and hashtags. Normalize text to Unicode NFC. Ignore letter case. Use Unicode letter and number boundaries for complete words. Match phrases as contiguous text after normalization. Match hashtags as complete tags; accept input with or without `#`. Do not translate, stem words, or change accents.

The image condition is optional. Without an attachment condition, matching text is sufficient. With an image condition, matching text and at least one image are required. Permit selection of other metadata attachment types. A rule must contain at least one non-empty text condition.

Example: rule A requires `apartment` and `rent`. Rule B requires `#housing`. Either rule can match. If both match, create one notification and record both rules.

Treat a media album as one item. Combine its text and attachment metadata before evaluation. Use a bounded collection delay. Persist incomplete album state for restart recovery. Do not create one notification per image.

Store one notification per account, external source, and item identity. Store the source name, available sender details, text, source URL, message time, match time, and matched rule headings. Preserve snapshots when a source or rule changes. If a sender or URL is unavailable, label it as unavailable.

Evaluate recovered items with the rules active at processing time. Do not reprocess stored matches when rules change. Discard unmatched content after processing, except temporary recovery state. Keep matched content until the user deletes it.

## 6. Storage, recovery, and notifications

Use one SQLite database with foreign keys, WAL mode, and versioned migrations. Store accounts, sources, rules, recovery positions, incomplete albums, matches, notification jobs, UI sessions, and activity events.

Commit each match, its delivery jobs for enabled channels, and the completed processing position in one transaction. Advance positions for unmatched items too. Do not advance beyond an incomplete item. Merge live events and recovery results through the same duplicate checks. Keep recovery ordered per source.

Send email immediately after commit. Each message must contain the source, sender, text, matched rules, and source link when available. Use SMTP with TLS. Escape all untrusted HTML. Do not attach images.

The email worker must resume pending jobs after restart. Store attempt count, next attempt time, and last error. Retry temporary failures with increasing delays, capped at one hour. Keep failed jobs for manual retry. SMTP acceptance marks a job as sent; inbox delivery is outside the system's control.

Database notifications must be unique. SMTP delivery is at least once: an uncertain send result can cause a duplicate email. Use a stable email Message-ID. Do not claim exactly-once email delivery.

Optionally send match and incident reports from the existing Telegram account to one configured chat, private/public channel or forum topic, alongside email. Compose new text reports with the same source, sender, text, rule headings, times and available original-message link as email; do not forward messages or attach media. Split long reports into numbered parts without losing text. Persist each part and its random ID before sending; retain acknowledged progress across restart and retry. Pace sends and respect Telegram wait responses. Retry temporary failures; expose permanent match-delivery failures for manual retry. Keep failed incident alerts pending without generating recursive alerts. Queue reports while the account is disconnected; email remains independent. Recognize generated report IDs and exclude these reports from matching to prevent feedback loops. Enabling Telegram reports affects new matches and recurring incidents; do not replay old matches. Reports use the configured destination when sending; acknowledged parts are not resent if the destination changes.

Provide independent email and Telegram switches in Settings, applying to matches and incidents immediately and surviving restart. A disabled channel creates no new delivery jobs and holds its existing pending jobs; re-enabling resumes pending work without replaying matches processed while off. An in-flight send may finish. Both channels may be off while matches, positions and incidents continue to be stored. Manual retry must not bypass a disabled channel. Telegram must first be configured and enabled in the protected file. Store UI preferences separately from transport credentials; never modify protected configuration through this API.

Record all operational errors. Email each incident and create its Telegram report when enabled. Group repeated errors from the same incident; retain their occurrence counts. Keep email failure alerts pending until SMTP works. Do not create recursive alerts about failed alert emails. Write errors to stderr if the database fails. A stopped process cannot send its own failure alert.

Delete activity events after 30 days. Retain open incidents and pending delivery jobs. Keep secret values and message bodies out of operational logs.

## 7. Web UI and access

Use English, a light theme, Web Awesome controls, clear spacing, and iOS-style navigation. Follow the Web Awesome documentation site’s white surfaces, light borders, compact control typography and restrained blue accents. Design for mobile screens first. Support Safari and Chromium. Use semantic HTML, visible focus, labelled fields, and touch targets of at least 44 CSS pixels. Do not add PWA support, dark mode, or decorative blur effects.

Release 1 pages: Dashboard, Sources, Rules, Matched Messages, Connectors, Activity Log, and Settings. Add Posts and Schedules in Phase 2. Use bottom navigation for frequent actions and a More page for other pages. Show loading, empty, error, and disconnected states.

Show user-action failures in a dismissible modal dialog, including deletion restrictions, failed saves and retries. Bulk failures include completed/failed counts and distinct error messages. Keep loading errors inline with retry controls.

Show recent matches in pages, newest first. Provide match details and manual deletion. Deletion must not remove Telegram content or cancel notifications already queued. Show lazy image previews in match lists and details with click/touch zoom, album navigation, keyboard controls and an accessible modal viewer. Serve images only through authenticated, match-scoped routes. Preserve per-image message references for new albums; use a bounded history lookup for older albums. Cache at most 100 MiB of recently viewed JPEG, PNG, GIF and WebP data, with 1 MiB preview and 10 MiB enlarged-image limits. Cached images may work offline; deleted/inaccessible originals or unsupported images show a retryable unavailable state. Deleting a match removes its image cache. Filter matches by case-insensitive, NFC-normalized message text and one or more saved rule headings (any selected rule), combining both filters before pagination. Rule choices include historical headings; identical headings share a filter. Read status, bookmarks, archives, and rule testing are later work.

Read the access password from a protected configuration file. Do not send it to the client build. Use random session tokens; store token hashes on the server. Sessions expire after seven days. Provide logout. Use HttpOnly, SameSite cookies and Secure cookies with HTTPS. Check request origin for writes. Limit login attempts and request sizes. Return only safe settings through the API.

Serve the UI and JSON API from one origin. Use HTTPS behind a reverse proxy on a VPS. Permit HTTP from loopback and private/link-local networks for local use. Trust proxy headers only from configured proxies. Use authenticated, paginated API routes for sources, rules, matches, activity, connector status, and safe settings. Poll status while the UI is visible.

## 8. Configuration and operation

File-only settings: password, bind address, public origin, trusted proxy settings, database and session paths, Telegram credentials, SMTP settings, sender and recipient, and Telegram report enable/destination settings. UI settings: source selection, rules, notification channel switches, and posts and schedules. Restart the process after file configuration changes.

Run one application process. Start recovery and email workers without browser access. Support graceful shutdown and bounded connector retries. Respect Telegram wait responses. Provide a health endpoint without secret values. Use UTC for storage and display. Label displayed times as UTC.

Support a regular Node.js process and an optional container. Store the database and session on a persistent local volume. Do not run two instances against the same data directory. Basic backup is an operator action: stop the process and copy the data directory. Automated backup and restore are later work.

## 9. Phase 2: publication

Create a reusable post in the UI with formatted text and uploaded images. Posts contain content only; select destinations in schedules. The Posts page links to schedule creation with its post preselected. Use schedule Run Now for immediate publication. Publish from the personal account to one group or forum topic per schedule. Import from existing Telegram messages is later work.

Deleting a post also deletes its publication history and uploaded images atomically. Existing schedules, including paused schedules, block post deletion; deleted schedules and publication history do not. Resolve queued, running or uncertain runs before deleting their post. Preserve published Telegram messages, other posts' history and surviving schedules' replacement tracking.

Support bold, italic, underline, strikethrough, spoilers, inline code, preformatted text, links and blockquotes in a WYSIWYG post editor with a labelled toolbar, typing styles, links, undo/redo and keyboard shortcuts, plus attached-image ordering. Paste plain text using the current style. Preserve formatting and image order when saving, reopening and publishing posts, including captions, schedules and retry snapshots.

Support configurable intervals of 1–24 whole hours, plus daily, weekly, and monthly calendar schedules in UTC. Hourly intervals count from the schedule’s last successful publication, including Run Now and successful retries. Before its first publication, count from creation or a recurrence change. Changing the interval uses the saved last publication time even if its history was deleted; an overdue schedule runs once on recovery. Repeat one post. Clamp an unavailable monthly day to the month's last day. Preserve the original day for later months. Provide Pause, Resume, and Run Now. Run Now restarts hourly intervals after success; daily, weekly and monthly recurring times stay unchanged.

Schedules support editing their post, destination and UTC recurrence. Preserve pause state; recompute the next run only when recurrence changes. Retain previous message IDs and their original destination when changing destinations. Confirm schedule deletion; stop future runs while retaining its post, Telegram messages and publication history. Block edits and deletion while a run is queued, running, failed or uncertain; resolve it through publication history first. Serialize these actions with run creation.

Before publication, delete the previous publication from that schedule. Delete only system-created messages. Store every sent message ID, including album items. If deletion fails, stop that run and report the error. Treat an already deleted message as success.

After downtime, run one overdue publication immediately. Do not replay every missed interval. Then wait a full hourly interval after successful publication, or resume the original calendar recurrence. Serialize runs per schedule. Paused schedules must not run during restart. Store run state before external calls. Reconcile uncertain publication results before retrying.

## 10. Completion and deferred work

Release 1 is complete when CLI connection setup, source selection, matching, stored notifications, and email delivery work together. Verify restart recovery, duplicate handling, optional image conditions, and mobile access manually. Automated tests and CI are not required for this release.

Defer multiple users/accounts, website adapters, nested rules, media analysis, rule tests against recent messages, notification rate limits, digests, configuration export/import, and session encryption at rest. Retain the connector and ownership boundaries for these changes.

## Reference documentation

- [Telegram application credentials](https://core.telegram.org/api/obtaining_api_id)
- [Telegram QR login](https://core.telegram.org/api/qr-login)
- [GramJS client](https://gram.js.org/beta/classes/TelegramClient.html)
- [Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Preact](https://preactjs.com/)
- [Nodemailer](https://nodemailer.com/)

### Bulk list actions

Sources, rules, matches, posts, schedules, publication history, activity and notification delivery provide an opt-in Select mode. Hide item checkboxes until Select is pressed. Place them inside each card in reserved space, and show bulk actions in a floating toolbar so entering or leaving Select mode does not move card content. In Select mode, clicking or tapping anywhere in a tile toggles selection; tile links, buttons and image previews must not act on those clicks. Support individual selection, Select page, Clear selection and Cancel selection. Changing page or activity view clears selection. Confirm bulk deletion once; report completed and failed counts, exit Select mode after completion (including partial failures), and continue independent operations after failures.

Offer Delete plus Enable/Disable for sources and rules, Pause/Resume for schedules, Retry for failed notifications and publications, and Cancel for queued/failed publication runs. Posts and matches have Delete only. Existing relationship and unfinished-run restrictions apply. Delete only completed publication history, accepted notification records, and informational/resolved events without pending alerts. Preserve Telegram content, queued notifications, schedule replacement tracking, and recognition of deleted Telegram reports. Discovery and dashboard summaries remain outside bulk deletion.

Entity lists use a shared `EntityList` component for selection, list states and pagination. Each use supplies its data, actions, item rendering, labels and empty-state text. Fetching stays in the page. Filters and configurable list/tile views remain future work.
