# Implementation and manual checks

Recorded 2026-10-23, Node.js 24.19.0. Release 1 implementation tasks 01–11 are implemented. Task 12 (live acceptance) is pending. Phase 2 tasks 13–15 have not started: the agreed task list requires Release 1 acceptance first.

Checks used disposable local databases, ad hoc commands, an isolated UI fixture and a simulated mail transport. No automated test suite or CI was added. No real Telegram account or external SMTP service was connected; fixtures are not shipped as application data.

| Check | Observed result |
| --- | --- |
| Clean installation and build | `npm ci`, `npm run build`, `npm run check` pass. Exact versions and lockfile present. One Node process serves HTML, JS and CSS. |
| Connector boundary | GramJS imports occur only inside `server/src/adapters/telegram/`. Shared contracts have no runtime dependencies. |
| Configuration | Invalid fields produce named errors without their values. An unprotected config file is rejected. Session paths inside the checkout or symbolic links are rejected. Missing session reports authorization required without attempting network login. |
| Migrations and transactions | Database is created and reopened; sources and positions survive. Duplicate item commits produce one stored match and one email job. Unmatched items advance positions. Removing a source preserves snapshots; deleting a match keeps queued email. |
| Access | Unauthenticated protected reads return 401. Wrong write origins return 403. Login creates a hashed server session and HttpOnly cookie. Logout invalidates it. Twenty parallel bad logins produce five 401s and fifteen 429s. HTTPS proxy access sets Secure. |
| Source lifecycle | Fixture discovery includes chat and topic identities. First enable saves the supplied current position; re-enable saves a fresh position and excludes the disabled interval. |
| Rules | Mixed case, NFC decomposed accents, Unicode word boundaries, exact phrases, complete hashtags and Greek sigma case equivalence pass local examples. Text-only matches succeed with no attachment condition, fail with required images, and succeed with image metadata. |
| Recovery and albums | Interrupted history fetch resumes after the persisted buffered prefix. Restart with an incomplete album preserves the barrier. Interleaved album/messages commit correctly. Whole-forum and topic rules produce one notification with both names. Repeated recovery produces no duplicate notifications or jobs. Failed album staging rolls back buffered fetch progress. Completed temporary recovery content is removed. |
| Email and incidents | Simulated SMTP failure retains jobs, attempts, next attempt and safe errors across worker restarts. Recovery sends pending match and incident jobs. HTML is escaped, Message-ID is stable, repeated incidents are grouped, and failed alerts do not create recursive jobs. Queued content survives match deletion and is cleared after SMTP acceptance. |
| Process operation | Real application starts with isolated provider-free configuration; health and login work. SIGKILL followed by restart preserves data and releases the exclusive data lock. A second process is rejected. SIGTERM exits cleanly. Pruning removes old activity while retaining an open incident and pending alert. |
| Container operation | Pinned image builds using the managed proxy CA as a build secret. Non-root container starts with bind-mounted state/config, stops and restarts with its source position retained, rejects a competing instance using the volume, and accepts protected requests through a configured trusted HTTPS proxy. Test containers were removed. |
| Chromium mobile layout | Chromium 154 at 390×844 and 320px width: login, dashboard, source discovery/selection, two-condition rule creation with required Image, rule editing, match details, delivery view, settings and logout checked. No horizontal overflow observed. Form fields have labels, visible controls/links have 44px targets, and Tab moves to a field with a visible focus outline. |
| Background UI polling | Polling pauses when visibility is hidden and resumes on visibility change. |

## Pending live acceptance (task 12)

The environment has no protected real-provider configuration. Supply only its path through `MONITOR_CONFIG`; do not commit it or send secret values in chat. The operator must complete the interactive QR scan and two-step verification if enabled.

- Authorize a real Telegram account, restart using its saved session, and verify invalid/revoked-session reconnection instructions.
- Discover and select real groups, channels, private chats and forum topics.
- Create two enabled rules that match one new item; verify one stored notification, both rule names and one SMTP-accepted match email. Repeat with a text-only item and an image-required rule.
- Stop the service, add matching messages, restart, and verify all available missed items appear once, including albums and whole-forum/topic overlap.
- Verify SMTP outage recovery with a real TLS SMTP server, manual retry, and safe delivery status. Inbox delivery remains outside the application's control.
- Verify retention when removing sources/rules and deleting matches through the production UI.
- Check Safari on a phone, real mobile login/logout, and keyboard access. Chromium emulation does not establish Safari compatibility.

After those results are recorded and Release 1 is accepted, continue tasks 13–15 in their listed order. Publication, image uploads, schedules, Run Now and replacement/deletion recovery are not implemented yet.
