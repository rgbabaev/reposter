# Manual checks

Updated 2026-10-25. Tasks 01–11 and 13–15 implemented. Operator reports Release 1 acceptance checks passed except physical-phone testing and authorized Phase 2 with that check deferred. Publication, scheduled replacement, Pause/Resume and Run Now checks are operator-reported passed; full Phase 2 acceptance remains pending.

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
