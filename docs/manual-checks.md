# Manual checks

Updated 2026-10-25. Tasks 01–11 and 13–22 implemented. Operator reports Release 1 acceptance checks passed except physical-phone testing and authorized Phase 2 with that check deferred. Publication, scheduled replacement, Pause/Resume and Run Now checks are operator-reported passed; full Phase 2 acceptance remains pending.

## Verified locally

Disposable databases, UI fixtures and simulated SMTP; no automated suite or CI.

| Area | Result |
| --- | --- |
| Build | `npm ci`, `npm run build`, `npm run check` passed. Node pinned to 24.19.0; later checks used 24.15.0 (installation with `--engine-strict=false`) and 24.22.1. |
| Boundaries | GramJS stays inside the Telegram adapter; shared contracts have no runtime dependencies. |
| Configuration | Safe field errors; protected config/session files; invalid sessions and non-regular session files rejected. |
| Storage | Migrations, restart persistence, atomic match/job/position commits, deduplication, unmatched-position advancement and snapshot retention passed. Deleting matches preserves queued email. |
| Access | Protected reads, origin checks, hashed sessions, logout, login limits and HTTPS cookie flags passed. |
| Sources/rules | Enable/re-enable boundaries, NFC/case handling, Unicode words, phrases, hashtags and optional attachment conditions passed. |
| Recovery | Buffered restart, incomplete/interleaved albums, forum/topic deduplication, rollback and temporary-content cleanup passed. |
| Email | Retry persistence, restart recovery, escaping, stable Message-ID, incident grouping and non-recursive alerts passed with simulated SMTP. |
| Operation | Health/login, crash recovery, exclusive data lock, graceful shutdown and retention passed. Non-root container restart preserved mounted data. |
| UI | Chromium 154 at 390×844 and 320px: setup, editing, match details, delivery, settings and logout passed; no overflow. Labels, focus, 44px targets and visibility-aware polling checked. |

## Corrections verified

- Historical failed publication runs no longer block post edits. Migration 004 preserves existing images; failed retries retain their original text/images while new publications use edits. Disposable storage checks passed migration, restart, shared-reference cleanup and queued/running/uncertain edit locks. Chromium passed name/text edits, image replacement/removal, reopening saved changes and retrying the original three-image snapshot after editing.
- Basic-group publication omits the alternate-sender field; supergroup/topic publication retains the personal sender. Real GramJS request resolution/serialization passed for text, one image and three-image albums with stubbed RPC. Confirmed rejections/preparation failures remain retryable; ambiguous/partial sends remain uncertain; safe provider codes survive review. The operator's three images prepared successfully against Telegram with send RPCs blocked. On 2026-10-25 the operator reported publication working after the fix; the original provider error was not retained by the old code.
- Shutdown cancels blocked Telegram head, entity, history, discovery and startup calls. Simulated pending requests drained without false incidents or late storage access; unfinished positions stayed unchanged. Disposable-process SIGINT/SIGTERM checks exited successfully in 7–10 ms and reused storage after restart. Deadline messages identify unfinished components. Operator subsequently reported all non-phone checks passed.
- Temporary SMTP failures remain pending beyond ten attempts, with a one-hour retry cap. A disposable database and simulated transport verified restart delivery after attempt 13, both rule names, grouped incidents, permanent rejection and manual retry. Build and type checks passed on Node 24.22.1. Existing failed jobs still need manual retry.
- Load saved sessions before checking `authKey`; malformed sessions require authorization.
- Idle recovery checks the head first and skips entity/history requests when caught up.
- Replace faulty GramJS timeout pacing with 100-message pages spaced one second apart. Actual iterator with stubbed RPC recovered 205 messages across three pages, preserving ID gaps/order without warnings. Equal positions made no requests. See [ADR 0001](adr/0001-history-recovery-pacing.md). Restart the app to load the fix.

## Live checks

- Protected, Git-ignored configuration validates; saved Telegram session is authorized.
- Discovery succeeds for groups, private chats, channels and topics.
- Sources and rules configured; operator reports the matching and delivery acceptance checks passed.
- SMTP TLS/authentication verified after changing port 587 to required STARTTLS (`smtp.secure: false`). One incident email marked sent; no open incidents.

## Acceptance results

Local acceptance rerun (2026-10-24): a disposable database and simulated connector passed the two-rule single-notification/email-job workflow, optional/required images, unmatched-position advancement, downtime restart, duplicate recovery, snapshot retention and queued-email preservation. Loopback HTTP passed protected reads, login cookies, authenticated access and logout invalidation. Production build and type checks passed.

Operator reported all requested checks passed except phone testing, including Telegram setup, matching both rules once, optional/required images, downtime recovery, duplicate handling, albums, SMTP recovery, invalid sessions, retention and desktop Safari. These are operator-reported results, separate from the local checks above. SMTP acceptance does not confirm inbox delivery.

Physical-phone source/rule setup and login/logout remain deferred because a phone is unavailable. Desktop Safari passed; Chromium phone-width checks passed locally. The operator subsequently requested proceeding with the other tasks.

## Phase 2 local checks

Disposable SQLite databases, simulated connectors and real GramJS request constructors with stubbed RPC; no live messages sent.

| Area | Result |
| --- | --- |
| Posts | Text/image persistence, invalid upload rejection, active-run snapshot protection, group/topic destinations and all album message IDs passed. |
| Calendar | Daily/weekly/monthly UTC, leap years, month/year boundaries and preserving day 31 after February passed. |
| Schedules | Restart persistence, paused queued work, serialized Run Now, unchanged recurrence and one overdue run passed. |
| Replacement | Only tracked IDs deleted; already-missing IDs succeed; deletion failure blocks send; restart resumes remaining album deletions. |
| Uncertainty | Interrupted sends block schedules without resending; confirmed IDs or confirmed absence resolve runs; partial IDs are retained for replacement. |
| Adapter | Plain text, personal-account send-as, image uploads, album captions, forum reply targets, stable random IDs and response ID mapping passed with stubbed RPC. |
| UI/API | Chromium 141 at 390px/320px passed login, post/album creation, publish, monthly schedule, Pause/Resume, paused Run Now, replacement, uncertainty review/cancel, protected images and origin checks. No overflow or page errors; buttons met 44px targets. |
| Process | Actual SIGINT/SIGTERM shutdown and restart retained posts and a paused monthly schedule without publication, storage errors or shutdown deadlines. Disposable configuration only. |
| Build | Production build, TypeScript checks and whitespace checks passed on Node 24.22.1. Temporary review tools stayed outside the repository; no test suite or runtime dependencies added. |

## Phase 2 live results and remaining checks

On 2026-10-25 the operator reported: “Publication seems working.” Message format and destination coverage were not specified, so the full publication matrix remains open.

The operator subsequently confirmed completing the requested schedule checks: running a schedule twice removed the first publication, including all album images; Pause/Resume worked; Run Now preserved the next recurring time.

- Publish text and an image album to a controlled group and forum topic.
- Verify time-triggered recurrence, schedule persistence after restart, paused restart behavior and one overdue run after downtime.
- Restart during deletion/publication and verify uncertain-result review. Confirm failure incident emails through real SMTP.
- Check new Posts/Schedules screens in desktop Safari and on a physical phone.

## Tasks 16–17 local verification (2026-10-25)

Disposable legacy/current SQLite databases and a simulated connector passed:

- Migration 005 drops legacy rules while retaining sources, positions and historical match/email snapshots; foreign keys and unique assignments hold.
- Shared rules survive restart, match two groups, ignore an unassigned group and appear once for forum/topic overlap. The snapshot prefers the matching topic. Independent source disable, assignment changes without replay, retained snapshots and disabling the last-source rule passed.
- Schedule edits preserve pause state and recurring time unless recurrence changes. Queued, deleting, publishing, failed and uncertain runs block editing/deletion.
- Destination changes delete tracked IDs at the original destination before publishing at the new destination. Confirmed deletion retains the post/history and remains inactive after restart.

Shared-rule album recovery across restart produced one notification/email with the matching topic name. Failed replacement deletion followed by cancellation retained the original destination and remaining IDs; the next run deleted only those remaining IDs before publishing.

Chromium with the real HTTP API passed at 390px and 320px: assigning disabled sources, saving shared rules, editing unassigned rules with no sources left, schedule name/destination/recurrence edits, preserving pause/recurring time and confirmed deletion. No overflow or page errors occurred.

`npm run build`, `npm run check` and `git diff --check` passed on Node 24.22.1. No test suite, CI or dependencies were added. See the remaining operator checks below.

## Tasks 16–17 operator checklist

Use controlled Telegram destinations. Stop the process and copy the data directory before upgrading. Migration 005 intentionally removes all existing rules; recreate them after restart.

- [ ] Upgrade and confirm sources, positions, stored matches and email history remain; old rules are gone. Recreate required rules and restart to verify persistence.
- [ ] Assign one rule to two groups. Send matching text to each and to an unassigned group: only the assigned groups produce notifications/emails. Confirm optional images and multiple matching rule names still work.
- [ ] Assign that rule to both a forum and its topic. Send matching text and an album: each item produces one notification/email, the shared rule name appears once and the matching topic supplies the source name.
- [ ] Edit conditions and disable the rule globally. Confirm both groups change together. Disable one source independently and confirm the other still matches. Re-enable without replaying the disabled period.
- [ ] Add/remove assignments without replaying completed messages. Remove one assigned source, then the last: retain the rule elsewhere, then retain it disabled/unassigned. Reassign it. Historical notifications must stay unchanged.
- [ ] Edit a paused schedule's name/post; verify pause state and next time survive restart. Change UTC recurrence and verify the next occurrence updates, including a month-end day.
- [ ] Publish from a schedule, change its destination, restart, then run again. Verify every previous album ID is removed at the old destination and the replacement appears only at the new one. Repeat with a forum topic.
- [ ] With a queued, running, failed or uncertain run, verify edit/delete is blocked and publication history offers the appropriate cancellation, retry or review. Resolve the run and retry the edit.
- [ ] Cancel the schedule-deletion confirmation once, then accept it. Restart: no future runs occur, while the reusable post, existing Telegram messages and publication history remain.
- [ ] Complete the remaining Phase 2 live matrix above: text/albums in groups/topics, timed recurrence, paused restart, one overdue run after downtime, interruption during deletion/publication and real incident-email delivery.
- [ ] On desktop Safari and a physical phone, check shared-source selection (including disabled sources), unassigned rules, schedule editing/deletion, keyboard/focus, layout and login/logout. Physical-phone acceptance remains deferred until performed.

## Tasks 18–19

See [update-checks.md](update-checks.md) for local verification and the current consolidated operator checklist. Earlier live results above remain unchanged.

## WYSIWYG editor (2026-10-26)

Production build, type and whitespace checks passed. Disposable browser checks in Chromium and WebKit passed visible formatting, all styles, link editing/validation, style toggles while typing, shortcuts, undo/redo, save/reopen, touch controls, 320/390px layouts and 44px targets. Additional checks passed deletion to empty, simulated IME input, emoji, plain-text paste, HTML isolation, character limits and consecutive/trailing newlines. Deterministic model checks preserved text and valid Telegram nesting; existing migration/retry snapshot smoke checks passed. No live messages were sent or test suite added. Physical-phone keyboard and Telegram checks remain in [update-checks.md](update-checks.md).

## Post destinations (2026-10-26)

Posts now links to schedule creation instead of presenting a destination/direct-publication form. Chromium and WebKit passed post preselection, saved schedule destination, ordinary creation/editing and 390/320px layouts. Posts no longer fetches sources. Build, type and whitespace checks passed.

## Telegram notification reports (2026-10-27)

Disposable SQLite and simulated connectors/SMTP passed legacy email-job migration, atomic two-channel queues and positions, duplicate handling, independent delivery, Unicode report splitting, original links, restart/partial progress, stable random IDs, rate waits, permanent/manual retries, grouped/non-recursive incidents, feedback prevention, match deletion retention and bounded shutdown. Email-only configurations still work. Real GramJS constructors with stubbed RPC serialized newly composed reports for private chats, groups, channels and topics; waits, auth, uncertain results and cancellation passed without forwarding/media calls.

Chromium and WebKit at 390/320px passed per-channel match/activity status, Telegram retry, dashboard counts, safe settings and layout. Production build, type and whitespace checks passed. No test suite or dependencies were added.

A read-only lookup of the authorized account identified the requested private ReposterNotifications channel, distinct from the group with the same title. Its stable ID is configured in the operator's protected, ignored configuration. No live notification was sent. Restart/migration and live report acceptance remain in [update-checks.md](update-checks.md).

On 2026-10-28 the operator requested the ReposterNotifications chat instead. A second read-only lookup confirmed the distinct basic-group destination; the protected configuration now uses its ID. Fourteen Telegram jobs were pending with connection errors. Pending parts use the new destination after restart; no live report was sent during this change.
