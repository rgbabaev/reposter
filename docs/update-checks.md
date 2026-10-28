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

## Remaining live acceptance

- [ ] Share one rule across two groups and forum/topic overlap. Verify all conditions, optional/required images, one notification/email per item, one shared-rule heading, independent source disable, assignment changes without replay and retained disabled/unassigned rules after last-source removal.
- [ ] Edit a paused schedule's post/destination/recurrence; verify persistence, unchanged next time for post/destination edits, updated time for recurrence changes and month-end clamping.
- [ ] Change a schedule destination after publishing an album. Its next run deletes every tracked message at the original destination before sending to the new one. Verify blocked edit/delete during unfinished runs and retained history/messages after confirmed schedule deletion.
- [ ] Verify timed recurrence, paused restart and one overdue run after downtime. Interrupt deletion/publication; deletion resumes safely and uncertain sends require review before retry. Confirm real SMTP incident delivery.
- [ ] Complete source/rule setup, post/schedule editing and login/logout on a physical phone and desktop Safari. Physical-phone acceptance remains pending until performed.

Record outcomes in `manual-checks.md`. SMTP acceptance does not establish inbox delivery.
