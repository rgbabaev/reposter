# Implementation Tasks

Reference: `specification.md`. Implementation status and actual check results: [manual-checks.md](manual-checks.md). Tasks 01–11 and 13–26 are implemented. The operator reports Release 1 checks passed except physical-phone testing; desktop Safari passed, and the operator authorized proceeding with the phone check deferred. Live Phase 2 publication checks remain pending. Follow the order below. Each task states its completion check. Use manual checks; do not add an automated test suite or CI in Release 1.

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

- [x] Add Telegram-supported text formatting controls to the post editor and preserve formatting through saving, reopening and publication, including image captions.
- [x] Allow reordering attached images with mobile and keyboard controls. Persist the chosen order and use it when publishing albums.
- [x] Preserve formatting and image order in publication-run snapshots so retries use the original post version.
- Check: save and reopen a formatted post with reordered images, then publish to a group and forum topic. Verify formatting, captions and album order in Telegram, including scheduled publication and retries.

### 19. Replace entity names with property-based headings

- [x] Remove the `name` field from schedules, posts and rules in storage, shared contracts, API validation and UI forms. Migrate existing data without losing entity relationships or publication state.
- [x] Compose UI headings from entity properties: post text or attachment summary; rule conditions; schedule post, destination and recurrence. Provide useful headings for empty text and unassigned rules.
- [x] Use derived headings wherever these entities are referenced, including selectors, details, confirmations and new notification/publication snapshots. Preserve historical snapshots.
- Check: create, edit and reopen each entity without a name. Verify headings reflect property changes across the UI, migration preserves existing entities and relationships, and monitoring and scheduled publication still work.

Local verification for tasks 18–19 and the remaining operator checklist: [update-checks.md](update-checks.md).

### 20. Add WYSIWYG post editing

- [x] Replace explicit formatting ranges with a visual editable document and labelled toolbar for all supported Telegram styles and links.
- [x] Support style toggles, typing styles, clear formatting, undo/redo, keyboard shortcuts, Unicode/composition input and safe plain-text paste. Enforce text/caption limits.
- [x] Preserve text/entity storage, existing posts, image order and publication snapshots without a migration or new dependencies.
- Check: edit, save and reopen formatted text/captions in Safari and Chromium, including phone selection and keyboard input. Publish to a controlled Telegram group/topic and verify formatting. Local verification and remaining acceptance: [update-checks.md](update-checks.md).

### 21. Keep destination selection in schedules

- [x] Remove destination selection and direct publication from Posts. Keep posts reusable content.
- [x] Link each post to schedule creation with its post preselected. Use schedule Run Now for immediate publication.
- Check: Posts requires no source lookup; Create schedule selects the correct post, destination selection saves on the schedule, and ordinary schedule creation/editing still work.

### 22. Add Telegram notification reports

- [x] Add optional, file-configured reports from the existing Telegram account to one chat/channel/topic for both matches and incidents, alongside email.
- [x] Share report content and original links; compose new messages without forwarding or media. Preserve complete Unicode text in numbered parts.
- [x] Migrate email jobs to channel-aware notification jobs without changing IDs, payloads or delivery history. Commit both channels with matches and positions; preserve retry, part progress and random IDs through restart.
- [x] Handle disconnection, waits, temporary/permanent failures, manual retry, graceful shutdown, incident grouping and report feedback prevention. Keep channel delivery independent.
- [x] Show both channels and partial progress in match details/activity, dashboard counts and safe settings. Document configuration and live checks.
- Check: receive a match report and an incident report in the configured Telegram destination and email; verify original links, restart recovery, long-report parts and independent failures. Local results and remaining live checks: [manual-checks.md](manual-checks.md), [update-checks.md](update-checks.md).

### 23. Add notification channel switches

- [x] Add independent email/Telegram switches in Settings with authenticated, origin-checked updates, strict validation and restart persistence.
- [x] Gate new jobs and worker delivery per channel; hold pending work when off, resume on enable and prevent retry bypass. Keep matches/incidents/positions when both are off; permit an in-flight send to finish.
- [x] Preserve existing defaults on migration. Keep Telegram unavailable until file configuration is enabled; retain credentials and destinations outside UI preferences.
- Check: toggle each channel independently, reload/restart, and verify new-job suppression and pending-job recovery. Both-off processing still stores matches/incidents. Invalid or unauthorized updates leave preferences unchanged.

### 24. Add matched image previews and zoom

- [x] Retain image message IDs in new match/album metadata. Add optional connector image discovery/download operations with bounded legacy album lookup, size limits and cancellation.
- [x] Add authenticated, match-scoped preview/full-image routes and a persistent 100 MiB cache. Coalesce duplicate requests, limit concurrent downloads and remove cached images with match deletion.
- [x] Show lazy thumbnails in match lists/details and a modal zoom viewer with album navigation, touch/keyboard controls, Escape/focus restoration and unavailable/retry states.
- Check: view a single image and album in current/older matches, zoom/navigate, restart/offline with cached images, and delete the match. Confirm unsupported/deleted images and source removal do not break matching or notifications. Local results and remaining live checks are in [manual-checks.md](manual-checks.md) and [update-checks.md](update-checks.md).

## Later work: ordered backlog

1. Add rule tests against recent messages, read status, bookmarks, and archives.
2. Add notification rate limits and email digests.
3. Add nested conditions, more textual fields, attachment content, and media inspection.
4. Add post import from Telegram messages.
5. Add multiple accounts, then multiple users with access isolation.
6. Add website connectors after checking each site's access methods and permitted use.
7. Add configuration export/import, session encryption, and automated backup/restore.
8. Add Telegram connection setup through the web UI.

### 25. Add opt-in bulk list actions

- [x] Add shared Select mode, page selection, clear/cancel, eligible action counts and deletion confirmation to all entity lists.
- [x] Support entity actions through existing APIs, sequential partial results and automatic exit from Select mode.
- [x] Add guarded history deletion, retaining pending work, schedule tracking and deleted Telegram report identities.
- Check: verify mixed-success batches, selection reset across pages/views, deletion on the final page, and mobile/keyboard operation. See [manual-checks.md](manual-checks.md).

### 26. Extract reusable entity list

- [x] Consolidate entity list rendering, selection, loading/errors, empty states and pagination in a configurable component.
- [x] Migrate all seven entity lists while preserving domain actions and whole-tile selection.
- Check: build/type checks and disposable Chromium/WebKit checks cover existing selection, bulk actions, pagination and image interaction. Filters and view settings are deferred.

### 27. Filter matched messages

- [x] Add combined message-text and historical rule-heading filters before pagination, in a modal opened by Filter next to Select, with Apply/Clear/Cancel controls and selection reset.
- Check: type/build checks and disposable storage checks cover Unicode text, literal search, combined filters and pagination.

### 28. Share modal dialog behavior

- [x] Extract native dialog lifecycle, scroll locking, accessible naming and optional backdrop dismissal; reuse for match filters and enlarged images.
- Check: type/build checks and Chromium/WebKit checks cover filter actions, Escape/focus restoration and image navigation/zoom.

### 29. Migrate to Web Awesome

- [x] Bundle pinned free Web Awesome components and the light theme directly with Preact, without React compatibility.
- [x] Migrate controls, cards, status feedback, confirmations and shared dialogs; retain native image upload and Telegram document editing.
- [x] Verify validation/submission, selects, switches, editor selection, bulk actions, modal focus and mobile layouts in Chromium/WebKit.
- Check: disposable API/database fixtures cover saved values, partial failures, confirmations, image zoom and 320/390/900px layouts. See [update-checks.md](update-checks.md).

### 30. Refine Web Awesome appearance

- [x] Match the documentation site’s white surfaces, typography, fine borders and restrained accents using shared theme tokens.
- [x] Refine cards, metrics, navigation, form spacing and the editor toolbar while retaining accessible controls.
- Check: production/type checks and Chromium/WebKit regressions cover forms, lists and dialogs; visual checks cover 320/390/900/1280px layouts.

### 31. Add hourly publication intervals

- [x] Add configurable 1–24 whole-hour intervals to schedule creation, editing, validation and headings.
- [x] Preserve interval cadence through midnight, restart, downtime, slow runs and Run Now; retain pause and unfinished-run restrictions.
- Check: type/build checks, recurrence and storage regressions, and browser creation/editing checks. Results: [update-checks.md](update-checks.md).

### 32. Show action failures in dialogs

- [x] Use a shared dismissible dialog for single and bulk action failures, including deletion restrictions, saves and retries.
- [x] Preserve bulk result counts, form values and inline loading/retry states.
- Check: type/build checks and Chromium/WebKit cover deletion failures, Close/Escape, autofocus, scroll cleanup, bulk partial results, failed-save recovery and 320/390px layouts. Results: [update-checks.md](update-checks.md).

### 33. Delete publication history with posts

- [x] Atomically remove a post, its history and images; release deleted schedule references while preserving other posts' history and surviving schedules' replacement tracking.
- [x] Retain existing/paused schedule and active-run deletion guards; update single/bulk confirmations.
- Check: build/type checks, storage regressions and Chromium/WebKit single/bulk deletion. Results: [update-checks.md](update-checks.md).

### 34. Count hourly intervals from successful publication

- [x] Persist each schedule's last successful publication independently of history; use it for interval changes, Run Now, retries and subsequent runs.
- [x] Backfill and correct existing hourly due times without resuming paused schedules or bypassing unfinished runs; retain calendar recurrence.
- Check: build/type checks and regression coverage for two six-hour schedules, timers, restart, upgrade, slow runs, retries and deleted history. Results: [update-checks.md](update-checks.md).

### 35. Move publication history navigation

- [x] Add Publication history to More and remove the footer links from Posts and Schedules.
- Check: client type check and production build.

### 36. Keep list controls visible

- [x] Make the shared Select and Filter toolbar sticky at the viewport top with an opaque surface and subtle divider.
- Check: type/build checks and Chromium/WebKit scrolling, selection and filtering at phone and desktop widths.

### 37. Add action result toasts

- [x] Use the bundled Web Awesome toast for individual deletion confirmations and bulk action summaries, replacing inline result text.
- [x] Share one stack across navigation; auto-dismiss success after five seconds, retain partial/failed summaries until dismissed and preserve error dialogs for failure details.
- Check: type/build checks and disposable Chromium/WebKit checks cover deletion, bulk counts, dismissal, navigation and mobile placement.
