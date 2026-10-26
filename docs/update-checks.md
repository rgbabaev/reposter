# Remaining operator checks

Tasks 18–19 implemented on 2026-10-25. Run these checks against controlled Telegram groups/topics. Stop the application and copy its data directory before upgrading, then rebuild and restart. Migration 007 preserves rules and relationships but removes editable entity names; migration 005 still removes legacy single-source rules if not previously applied.

## Local verification

- Production build and TypeScript checks pass on Node 24.22.1.
- Disposable legacy/current SQLite checks passed migration, foreign keys, relationships, positions, historical publication headings, rule matching, schedule pause/recurrence preservation and restart persistence.
- Formatting validation passed Unicode/emoji boundaries, unsafe-link rejection and overlapping-code/range rejection.
- Simulated failed publication followed by post edits and retry retained original formatting and ordered images.
- Chromium at 390px/320px passed formatting save/reopen, Unicode text editing, keyboard image ordering, nameless rule/schedule creation and derived headings, without overflow or page errors.
- Real GramJS constructors with stubbed RPC serialized formatting for text, single captions and first-image album captions in groups/topics. No live messages were sent.

## Upgrade and headings

- [ ] Upgrade an existing database. Confirm posts, images, rules, assignments, schedules, previous publication IDs, matches and email/publication history remain. Restart and check again.
- [ ] Create/edit/reopen a post, rule and schedule without a name. Check headings in lists, post selectors, confirmations and publication history. Check image-only posts and disabled/unassigned rules.
- [ ] Change post text and rule conditions: current headings update, while earlier match/email/publication snapshots retain their original labels and content. New notifications and publications use derived headings.

## Formatting and image order

- [ ] Select text and apply each style: bold, italic, underline, strike, spoiler, code, preformatted, link and blockquote. Include emoji, accented/non-Latin text and nested bold/italic. Save, reopen and restart; formatting ranges remain correct. Remove formatting and edit text before/inside ranges.
- [ ] Reorder three distinct images using touch and keyboard buttons; remove/add an image. Save, reopen and restart; the order remains. Confirm controls, focus and layout in Safari/Chromium at narrow widths and on a physical phone.
- [ ] Publish formatted text, one image and a three-image album to both a group and a forum topic. Verify formatting, link targets, first-image caption, image order, personal-account sender and correct topic in Telegram.
- [ ] Repeat through a timed schedule. Cause a definite publication rejection in a controlled destination, then edit formatting/order and restore access. Retry the failed run: original content/order are sent; a new run uses edits.

## Remaining live acceptance

- [ ] Share one rule across two groups and forum/topic overlap. Verify all conditions, optional/required images, one notification/email per item, one shared-rule heading, independent source disable, assignment changes without replay and retained disabled/unassigned rules after last-source removal.
- [ ] Edit a paused schedule's post/destination/recurrence; verify persistence, unchanged next time for post/destination edits, updated time for recurrence changes and month-end clamping.
- [ ] Change a schedule destination after publishing an album. Its next run deletes every tracked message at the original destination before sending to the new one. Verify blocked edit/delete during unfinished runs and retained history/messages after confirmed schedule deletion.
- [ ] Verify timed recurrence, paused restart and one overdue run after downtime. Interrupt deletion/publication; deletion resumes safely and uncertain sends require review before retry. Confirm real SMTP incident delivery.
- [ ] Complete source/rule setup, post/schedule editing and login/logout on a physical phone and desktop Safari. Physical-phone acceptance remains pending until performed.

Record outcomes in `manual-checks.md`. SMTP acceptance does not establish inbox delivery.
