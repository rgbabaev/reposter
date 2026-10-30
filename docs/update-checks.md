# Remaining operator checks

Tasks 18–19 implemented on 2026-10-25; task 20 (WYSIWYG editor) on 2026-10-26. Run these checks against controlled Telegram groups/topics. Stop the application and copy its data directory before upgrading, then rebuild and restart. Migration 007 preserves rules and relationships but removes editable entity names; migration 005 still removes legacy single-source rules if not previously applied.

## Local verification

- Production build and TypeScript checks pass on Node 24.22.1.
- Disposable legacy/current SQLite checks passed migration, foreign keys, relationships, positions, historical publication headings, rule matching, schedule pause/recurrence preservation and restart persistence.
- Formatting validation passed Unicode/emoji boundaries, unsafe-link rejection and overlapping-code/range rejection.
- Simulated failed publication followed by post edits and retry retained original formatting and ordered images.
- Chromium at 390px/320px passed formatting save/reopen, Unicode text editing, keyboard image ordering, nameless rule/schedule creation and derived headings, without overflow or page errors.
- Real GramJS constructors with stubbed RPC serialized formatting for text, single captions and first-image album captions in groups/topics. No live messages were sent.

The WYSIWYG update passed Chromium/WebKit editing, touch, keyboard, paste, limit and simulated composition checks at 390px/320px. No storage migration or new dependency is needed for task 20. Clipboard HTML is pasted as text with the current style.

## Upgrade and headings

- [ ] Upgrade an existing database. Confirm posts, images, rules, assignments, schedules, previous publication IDs, matches and email/publication history remain. Restart and check again.
- [ ] From Posts, choose Create schedule: confirm the post is preselected and choose the destination there. Use schedule Run Now for immediate publication.
- [ ] Create/edit/reopen a post, rule and schedule without a name. Check headings in lists, post selectors, confirmations and publication history. Check image-only posts and disabled/unassigned rules.
- [ ] Change post text and rule conditions: current headings update, while earlier match/email/publication snapshots retain their original labels and content. New notifications and publications use derived headings.

## Formatting and image order

- [ ] In the WYSIWYG editor, select text and toggle each style: bold, italic, underline, strike, spoiler, code, preformatted, link and blockquote. Include emoji, accented/non-Latin text and nested bold/italic. Save, reopen and restart; visible formatting remains correct. Clear styles, edit links, and edit text before/inside formatted text. Toggle a style before typing; check undo/redo and Ctrl/Cmd+B/I/U/K/Z (Shift+Z for redo). Paste multiline text and verify text/caption limits. On a physical phone, test selection, toolbar taps, autocorrect and a non-Latin keyboard.
- [ ] Reorder three distinct images using touch and keyboard buttons; remove/add an image. Save, reopen and restart; the order remains. Confirm controls, focus and layout in Safari/Chromium at narrow widths and on a physical phone.
- [ ] Publish formatted text, one image and a three-image album to both a group and a forum topic. Verify formatting, link targets, first-image caption, image order, personal-account sender and correct topic in Telegram.
- [ ] Repeat through a timed schedule. Cause a definite publication rejection in a controlled destination, then edit formatting/order and restore access. Retry the failed run: original content/order are sent; a new run uses edits.

## Telegram reports (task 22)

The protected local configuration now enables both match and incident reports to the ReposterNotifications chat (changed from the channel on 2026-10-28), using the existing Telegram account. Restart after building to apply migration 008 and enable the worker. Stop and back up the data directory before upgrading. No live report has been sent during development.

- [ ] Confirm the account can post in the chat. Trigger one match with multiple matching rules: receive one email and one composed Telegram report with source, sender, text, rules, UTC times and a working original-message link. Confirm there is no forwarded-message header or media attachment.
- [ ] Use a missing-link/private-source case and a long Unicode/album-text match: labels remain useful, numbered parts preserve all text, and UI progress reaches accepted. Verify original links with an account that has source access.
- [ ] Restart with pending/partly sent reports. Confirm acknowledged parts are not sent again and remaining parts resume. Check that monitored notification destinations do not generate report loops.
- [ ] Exercise Telegram disconnection or lost posting permission in a controlled destination. Email continues; Telegram status/retry is independent. Restore access and retry. Respect real Telegram waits rather than repeatedly forcing sends.
- [ ] Trigger an operational incident and repeated occurrences: verify one grouped alert per channel, retained occurrence counts and no recursive notification failures. A Telegram account outage is initially reported through email; its Telegram alert waits for reconnection.
- [ ] Verify match deletion retains queued reports, historical email jobs still show their old statuses, disabling/re-enabling reports preserves pending work, and both delivery channels work on desktop Safari and a physical phone.

## Notification channel switches (task 23)

Restart after building to apply migration 009. Later switch changes require no restart.

- [ ] In Settings, turn email off while Telegram stays on. New matches/issues notify Telegram only. Existing email jobs remain queued without send attempts.
- [ ] Reverse the channels and check email-only delivery. Turn both off: matches/issues remain stored and source positions advance without new notification jobs.
- [ ] Reload and restart to verify switch persistence. Re-enable each channel: its old pending jobs resume, while matches from the off period are not replayed. A report already sending when switched off may finish.
- [ ] Verify retry cannot bypass an off channel, a failed settings save restores its checkbox state, and Telegram is unavailable until file configuration is enabled. Check keyboard and physical-phone use.

## Matched image previews (task 24)

Restart after building to apply migration 010.

- [ ] Open current and older single-image/album matches. Confirm thumbnail order and original images in the list and details, including forum topics and image documents.
- [ ] Click/tap to enlarge; check zoom/fit, scrolling, previous/next, arrow keys, Escape and restored focus in Safari/Chromium and on a phone.
- [ ] Restart or disconnect Telegram after viewing an image: cached previews/full images remain available. Uncached/deleted/inaccessible/unsupported images show unavailable/retry states. Large originals respect the 10 MiB limit.
- [ ] Remove a source and retain its matches/images; then delete a match and confirm its image URLs stop working. Check monitoring, album deduplication and text-only notifications remain unchanged.

## Remaining live acceptance

- [ ] Share one rule across two groups and forum/topic overlap. Verify all conditions, optional/required images, one notification/email per item, one shared-rule heading, independent source disable, assignment changes without replay and retained disabled/unassigned rules after last-source removal.
- [ ] Edit a paused schedule's post/destination/recurrence; verify persistence, unchanged next time for post/destination edits, updated time for recurrence changes and month-end clamping.
- [ ] Change a schedule destination after publishing an album. Its next run deletes every tracked message at the original destination before sending to the new one. Verify blocked edit/delete during unfinished runs and retained history/messages after confirmed schedule deletion.
- [ ] Verify timed recurrence, paused restart and one overdue run after downtime. Interrupt deletion/publication; deletion resumes safely and uncertain sends require review before retry. Confirm real SMTP incident delivery.
- [ ] Complete source/rule setup, post/schedule editing and login/logout on a physical phone and desktop Safari. Physical-phone acceptance remains pending until performed.

Record outcomes in `manual-checks.md`. SMTP acceptance does not establish inbox delivery.

## Bulk list actions

- On Sources, Rules, Matches, Posts, Schedules, Publications, Activity and Notification delivery, confirm checkboxes appear only after Select. Confirm checkboxes sit inside cards and toggling Select/Cancel does not move cards or headings. In Select mode, tap headings, links, buttons and image previews: each tap must only select/deselect the tile. After Cancel, their normal actions must work. Check individual selection, Select page, Clear and Cancel with touch and keyboard; swipe the floating action toolbar on narrow screens and confirm pagination remains reachable.
- Disable/enable several sources and rules; pause/resume schedules. Confirm re-enabled sources exclude disabled-period messages.
- Delete a mix of unused and referenced posts. Confirm successful deletes remain applied, the failure is explained and Select mode closes with all checkboxes hidden.
- Select records, change page or activity tab, and confirm selection clears. Delete the last records on the final page and confirm the list returns to a valid page.
- Retry failed deliveries/publications, cancel eligible runs, then delete completed history. Confirm pending notifications, uncertain/running publications and open incidents are protected.
- Delete stored matches and completed publication history. Confirm Telegram messages and queued notifications remain; the next scheduled replacement still deletes its previous tracked messages.
- Delete accepted Telegram delivery history, then recover monitored report-chat messages. Confirm those reports still cannot match rules or create notification loops.

After the entity-list extraction, spot-check Sources, Rules, Posts, Schedules, Matches and both Activity views: normal card actions work; Select preserves layout and makes every tile click toggle selection; completing a bulk action exits selection. Check empty lists, retry after a connection error and pagination after deleting the final page. Filters and view controls are not part of this change.

## Web Awesome migration (task 29)

Local checks on 2026-10-30 use disposable databases and a simulated connector; no Telegram or SMTP messages are sent.

- TypeScript and production builds pass with pinned Web Awesome 3.14.0, locally bundled assets and no React compatibility imports.
- Chromium/WebKit cover login validation and Enter submission; rule selects, checkboxes and save/reopen; rich text selection, bold, links and save/reopen; native upload and persisted image reordering; monthly schedule validation; notification switch persistence and failed-save rollback.
- List checks cover loading/error/retry, tile selection, bulk actions, partial failure and pagination. Dialog checks cover confirmation accept/cancel, Escape, autofocus/focus restoration, filtering, image zoom/navigation and unavailable-image retry. Layouts pass at 320/390/900px.
- Browser checks use only same-origin assets and APIs. CSP permits bundled icon `data:` fetches while retaining the existing script/style restrictions.
- Rebuild and restart to serve the new assets and CSP header. No database upgrade is required. Spot-check physical-phone selection, dropdowns, uploads and dialogs; device acceptance remains pending.

## Appearance refinement (task 30)

The interface now follows Web Awesome’s documentation styling using the existing default theme. Local visual checks cover login, dashboard, sources, rules, posts, schedules, settings and More at 320/390/900/1280px without horizontal overflow. Existing Chromium/WebKit form, bulk-action and image/dialog regressions remain the behavior checks. Physical-phone acceptance remains pending.

## Hourly publication intervals (task 31)

Local checks on 2026-10-30 use disposable databases and a simulated connector; no Telegram or SMTP messages are sent.

- Type/build checks and six regressions pass: interval validation, UTC boundaries, calendar compatibility, restart/pause/Run Now, replacement, editing restrictions and slow-run cadence. Run `npm run build && node --test server/tests/hourly-schedules.test.mjs`.
- Chromium/WebKit pass creation, editing/reopening, unchanged next time on unchanged recurrence, invalid/empty intervals, singular headings and switching back to daily. Layouts pass at 320/390/900px without page errors or horizontal overflow.
- No migration is required. Live Telegram interval timing and physical-phone checks remain pending.

## Action error dialogs (task 32)

Type checks and production build pass. Disposable Chromium/WebKit checks cover referenced-post deletion, Close/Escape dismissal, Close autofocus, scroll cleanup, 320/390px dialogs, mixed bulk deletion counts and failure details, preserved drafts after failed saves, successful retry and inline loading errors. No live Telegram or SMTP messages were sent.

## Post deletion and history (task 33)

- Build/type checks and all 13 backend tests pass (`npm run build && node --test server/tests/*.test.mjs`). Seven deletion regressions cover completed/failed history, retained images, existing/paused schedules, deleted schedules, active runs, other posts' history, subsequent replacement and transaction rollback.
- Disposable Chromium/WebKit checks pass single deletion, confirmation cancellation, history cleanup after schedule deletion, mixed bulk results and schedule-restriction dialogs. No live Telegram messages were sent or deleted; no migration is required.
