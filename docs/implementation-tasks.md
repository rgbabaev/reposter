# Implementation Tasks

Reference: `specification.md`. Implementation status and actual check results: [manual-checks.md](manual-checks.md). Tasks 01–11 and 13–17 are implemented. The operator reports Release 1 checks passed except physical-phone testing; desktop Safari passed, and the operator authorized proceeding with the phone check deferred. Live Phase 2 publication checks remain pending. Follow the order below. Each task states its completion check. Use manual checks; do not add an automated test suite or CI in Release 1.

## Release 1: monitoring

### 01. Create the repository

- [x] Create npm workspaces: `server/`, `client/`, and `shared/`.
- [x] Configure TypeScript, ESM, Preact, Vite, and root build/start commands.
- [x] Pin Node.js 24 and package versions. Record dependency purposes. Ignore secrets and generated data.
- Check: `npm ci` and the production build succeed. One process serves the built UI.

### 02. Define boundaries and contracts

- [x] Define common source, item, rule, match, and API types.
- [x] Define connector lifecycle, discovery, recovery, and capability contracts.
- [x] Keep Telegram types inside its adapter. Define owner and account references without account switching.
- Check: core services compile without importing GramJS.

### 03. Add configuration and storage

- [x] Validate the configuration file. Fail startup with field-specific errors that omit secret values.
- [x] Add SQLite migrations, foreign keys, WAL mode, and prepared statements.
- [x] Create storage for sources, rules, positions, incomplete albums, matches, jobs, sessions, and activity.
- [x] Add unique item keys and the transaction for match, email job, and processing position.
- Check: startup creates or migrates the database. Restart preserves data. Duplicate inserts cannot create duplicate matches.

### 04. Add web access control

- [x] Add password login, seven-day sessions, logout, cookie flags, origin checks, and login limits.
- [x] Add safe JSON errors, input validation, body limits, and protected API routing.
- [x] Add public-origin and trusted-proxy configuration. Keep secrets outside API responses.
- Check: an unauthenticated request cannot read protected data or change state. Logout invalidates its session.

### 05. Add Telegram CLI setup

- [x] Add QR login, token refresh, two-step verification input, and session persistence.
- [x] Require operator-provided application credentials. Restrict session-file permissions.
- [x] Add connection status, reconnection, wait handling, and shutdown.
- Check: scan the QR code, complete login, and restart without another login. Invalid authorization produces reconnect instructions.

### 06. Add source management

- [x] Discover groups, channels, private chats, and forum topics. Add refresh and source selection APIs.
- [x] Add enable, disable, and removal. Record initial and re-enable positions.
- [x] Retain match snapshots when a source is removed. Prevent forum/topic overlap from creating duplicate matches.
- Check: all supported source types can be selected. Messages from before enable and during disable do not create matches.

### 07. Add rule evaluation

- [x] Add rule CRUD and enable/disable APIs with the original single-source binding (replaced by multi-source assignments in task 17).
- [x] Add normalized word-part, whole-word, phrase, hashtag, and attachment-type conditions.
- [x] Require all conditions within a rule. Accept any matching rule. Record all matching rules on one notification.
- [x] Combine album text and metadata. Persist incomplete album state and use one album identity.
- Check: mixed-case text matches. Word boundaries and hashtags behave as specified. Images are optional unless a rule requires them.

### 08. Add monitoring and recovery

- [x] Normalize new messages and captions. Inspect attachment metadata without downloading media.
- [x] Route live events and history recovery through the same processing service.
- [x] Process each source in order. Commit matches and email jobs before advancing completed positions.
- [x] Recover every available missed item. Report history gaps and access failures.
- Check: interrupt processing and restart. All available missed matches appear once. Unmatched messages advance recovery. Album recovery creates one notification.

### 09. Add email and incident delivery

- [x] Add Nodemailer SMTP configuration and immediate delivery from stored jobs.
- [x] Include required match fields. Escape content and use stable Message-IDs.
- [x] Add retry delays, restart recovery, failed-job details, and manual retry.
- [x] Record errors, group repeated incidents, and queue error alerts without recursive failures.
- Check: SMTP failure preserves jobs. Recovery sends them. Repeated incidents do not create an alert loop. The UI exposes delivery status.

### 10. Build the mobile UI

- [x] Add the light theme, native-style controls, bottom navigation, and More page.
- [x] Build Login, Dashboard, Sources, Rules, Matched Messages, Connectors, Activity Log, and Settings.
- [x] Add match details, pagination, manual deletion, delivery retry, and safe configuration status.
- [x] Show UTC labels and loading, empty, error, and disconnected states. Poll only while visible.
- Check: complete source and rule setup on a phone-width screen. Check Safari, Chromium, keyboard use, and 44-pixel touch targets.

### 11. Complete operation and packaging

- [x] Add the health endpoint, graceful shutdown, log retention, and stderr fallback.
- [x] Provide regular-process commands and an optional container with persistent data mounts.
- [x] Document credentials, QR setup, SMTP, HTTPS, backup by stopped-process copy, and recovery limits.
- Check: restart the regular process and the container. Each preserves its data. Neither needs a browser to monitor or send email.

### 12. Accept Release 1

- [x] Connect Telegram through the CLI. Select a source and create two rules.
- [x] Confirm one matching item creates one stored notification and one queued email with both matching rule names.
- [x] Confirm text can match without images; then require images and confirm text-only items fail.
- [x] Stop the application, add matching messages, and restart. Confirm recovery and duplicate handling.
- [x] Check SMTP outage recovery, invalid session handling, match retention, and desktop Safari login/logout.
- [ ] Check source/rule setup and login/logout on a physical phone (deferred; desktop Safari passed).
- Check: all results meet the specification. Record manual check results and known limits in the repository.

## Phase 2: publication and deletion

### 13. Add post storage and publication

- [x] Add post and image storage, upload validation, Posts UI, and one-destination publication.
- [x] Add connector publication capabilities and persist all returned message IDs.
- Check: publish plain text and an image album to a group and a forum topic from the personal account.

### 14. Add persistent schedules

- [x] Add daily, weekly, and monthly UTC schedules, including month-end rules.
- [x] Add Schedules UI, Pause, Resume, and Run Now.
- [x] Serialize runs, preserve recurring times, and combine overdue intervals into one immediate run.
- Check: restart preserves schedules. A paused schedule stays paused. Run Now does not change the next recurring time.
- Live result: operator reports Pause/Resume and unchanged recurring time after Run Now passed (2026-10-25). Restart/downtime checks remain pending.

### 15. Add replacement and failure recovery

- [x] Delete only the previous system publication before sending its replacement.
- [x] Track album deletions, partial sends, run state, and uncertain external results.
- [x] Stop replacement when deletion fails. Add activity records and email alerts.
- Check: a run removes the previous post. Restart during deletion or publication does not blindly send another copy.
- Live result: operator reports replacement removed the previous publication and all album images (2026-10-25). Interrupted-run checks remain pending.

### 16. Add schedule editing and deletion

- [x] Add Edit UI and API for schedule name, post, destination and UTC recurrence.
- [x] Preserve pause state. Recompute the next occurrence when recurrence changes; name, post or destination changes must not shift it.
- [x] When the destination changes, retain the previous destination and message IDs. The next run must delete that publication at its original destination before publishing to the new one.
- [x] Add confirmed schedule deletion that stops future runs while retaining the reusable post, existing Telegram messages and publication history.
- [x] Block editing or deletion while a run is queued, running, failed or uncertain; link to publication history for cancellation, retry or review. Serialize these actions with run creation.
- Check: edits survive restart, recurrence changes update the next run, and paused schedules remain paused. Changing destinations removes the previous publication from the original destination. Deleted schedules never resume; their post, Telegram messages and run history remain available.

### 17. Share monitoring rules across multiple sources

- [x] Replace `rules.source_id` with a `rule_sources(rule_id, source_id)` relationship. Enforce unique assignments and foreign keys; index source-based lookup. Keep owner references on rules and validate that assigned sources belong to the same owner.
- [x] Add a transactional schema upgrade that drops existing rules and creates the new rule/assignment structure without backfilling. Rules must be recreated manually. Preserve sources, processing positions and historical match/email snapshots; leave earlier migrations unchanged.
- [x] Replace shared/API `sourceId` with `sourceIds`. Validate unique, existing source IDs; require at least one source for an enabled rule. Save rule fields and assignments atomically; update server and client together.
- [x] Evaluate a rule once when any assignment belongs to an eligible enabled source. Keep all-conditions/any-rule semantics, album identity and one notification/email job per item. Deduplicate shared rules across forum/topic overlap; derive the source snapshot from the incoming source and matched assignments, preferring a matching topic over the whole forum.
- [x] Remove only assignments when a source is removed. Preserve rules attached elsewhere; disable and retain a rule as unassigned when its last source is removed. Source disable must not disable a shared rule for other sources.
- [x] Add a labelled source checklist with selected count to the rule editor. Show assigned sources and unassigned state in rule lists. Make global edits/disable behavior clear and allow selecting disabled sources for later use.
- [x] Verify the upgrade removes old rules without changing other data, and newly created shared rules survive restart. Check assignment add/remove, global rule edits, independent source disable and last-source removal. Confirm one shared rule matches in two groups, ignores an unassigned group, and produces one notification with its name once for forum/topic overlap. Confirm assignment changes do not replay completed messages and historical snapshots remain unchanged.

Local verification for tasks 16–17 passed with disposable legacy/current databases, a simulated connector and Chromium. Live acceptance remains listed in [manual-checks.md](manual-checks.md).

### 18. Add post formatting and image ordering

- [ ] Add Telegram-supported text formatting controls to the post editor and preserve formatting through saving, reopening and publication, including image captions.
- [ ] Allow reordering attached images with mobile and keyboard controls. Persist the chosen order and use it when publishing albums.
- [ ] Preserve formatting and image order in publication-run snapshots so retries use the original post version.
- Check: save and reopen a formatted post with reordered images, then publish to a group and forum topic. Verify formatting, captions and album order in Telegram, including scheduled publication and retries.

### 19. Replace entity names with property-based headings

- [ ] Remove the `name` field from schedules, posts and rules in storage, shared contracts, API validation and UI forms. Migrate existing data without losing entity relationships or publication state.
- [ ] Compose UI headings from entity properties: post text or attachment summary; rule conditions; schedule post, destination and recurrence. Provide useful headings for empty text and unassigned rules.
- [ ] Use derived headings wherever these entities are referenced, including selectors, details, confirmations and new notification/publication snapshots. Preserve historical snapshots.
- Check: create, edit and reopen each entity without a name. Verify headings reflect property changes across the UI, migration preserves existing entities and relationships, and monitoring and scheduled publication still work.

## Later work: ordered backlog

1. Add rule tests against recent messages, search, read status, bookmarks, and archives.
2. Add notification rate limits and email digests.
3. Add nested conditions, more textual fields, attachment content, and media inspection.
4. Add post import from Telegram messages.
5. Add multiple accounts, then multiple users with access isolation.
6. Add website connectors after checking each site's access methods and permitted use.
7. Add configuration export/import, session encryption, and automated backup/restore.
8. Add Telegram connection setup through the web UI.
