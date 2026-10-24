# Manual checks

Updated 2026-10-24. Tasks 01–11 implemented; task 12 pending. Phase 2 waits for Release 1 acceptance.

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

- Load saved sessions before checking `authKey`; malformed sessions require authorization.
- Idle recovery checks the head first and skips entity/history requests when caught up.
- Replace faulty GramJS timeout pacing with 100-message pages spaced one second apart. Actual iterator with stubbed RPC recovered 205 messages across three pages, preserving ID gaps/order without warnings. Equal positions made no requests. See [ADR 0001](adr/0001-history-recovery-pacing.md). Restart the app to load the fix.

## Live checks

- Protected, Git-ignored configuration validates; saved Telegram session is authorized.
- Discovery succeeds for groups, private chats, channels and topics.
- Eight sources and six rules enabled; no stored matches yet.
- SMTP TLS/authentication verified after changing port 587 to required STARTTLS (`smtp.secure: false`). One incident email marked sent; no open incidents.

## Pending acceptance

- Fresh QR/2FA login, restart authorization and revoked-session instructions.
- One item matching two rules creates one notification, both rule names and one SMTP-accepted match email. Verify text-only and image-required cases.
- Live downtime recovery, duplicate handling, albums and forum/topic overlap.
- Real SMTP outage recovery, manual retry and delivery status. Inbox delivery is outside system control.
- Production UI retention after source/rule removal and match deletion.
- Safari on a phone, mobile login/logout and keyboard access.

Record results before accepting Release 1 and starting tasks 13–15.
