# Personal Monitor

A private Telegram monitoring application for one owner and one personal account. Select chats or forum topics, create text and attachment rules, and receive durable matched-message notifications by email.

The server uses Node.js HTTP, crypto and SQLite APIs. The mobile web UI uses Preact and plain CSS. One process serves the UI and API and runs recovery and email workers, including when no browser is open.

## Start locally

Use **Node.js 24.19.0** (`.nvmrc`). All direct package versions and the npm lockfile are pinned.

```sh
npm ci
npm run build
install -d -m 700 /srv/personal-monitor/data/telegram
install -m 600 config.example.json /srv/personal-monitor/config.json
```

The `/srv` directory must belong to the operating-system user running the application. Edit the protected configuration file and replace every placeholder. Obtain your own Telegram application credentials from [my.telegram.org](https://my.telegram.org). Configure an SMTP service with verified TLS, a sender, a recipient, and a strong access password. Keep this file and the authorized Telegram session outside the checkout.

Authorize Telegram in an interactive terminal:

```sh
MONITOR_CONFIG=/srv/personal-monitor/config.json npm run setup:telegram
```

In Telegram, open Settings → Devices → Link Desktop Device and scan the rotating QR code. Enter the Telegram two-step verification password in the terminal if requested; it is never saved. The authorized session is saved with owner-only permissions.

```sh
MONITOR_CONFIG=/srv/personal-monitor/config.json npm start
```

With the example loopback settings, open `http://127.0.0.1:3000`, sign in, refresh source discovery, choose sources, and add rules. `GET /health` provides a public health response without configuration values. For remote use, configure HTTPS and trusted proxies as described in [operations](docs/operations.md).

## Behavior

- Every text condition in a rule must pass; any enabled rule can match. Supported conditions are word parts, complete words, exact phrases and complete hashtags. Text uses NFC normalization and ignores letter case while retaining accents.
- Text alone can match. Selecting Image or another attachment type additionally requires matching metadata. Media is never downloaded or analyzed.
- Albums form one notification. Overlapping whole-forum and topic selections share duplicate detection and record all matching rule names.
- Enabling or re-enabling a source begins at its current position. Recovery after an outage processes available messages after saved positions using the rules active when processing resumes.
- Deleting a source or rule preserves notification snapshots. Deleting a stored match preserves any queued email and does not delete Telegram content.
- Email jobs survive restart. SMTP acceptance marks an email sent; inbox delivery is outside the application’s control. Delivery is **at least once**: an uncertain send result can produce a duplicate email, with a stable Message-ID.
- All stored and displayed times use UTC. UI sessions expire after seven days.

## Commands and structure

| Command or directory | Purpose |
| --- | --- |
| `npm ci` | Install exactly the locked dependencies |
| `npm run build` | Compile shared/server TypeScript and bundle the browser UI |
| `npm run check` | Check TypeScript contracts |
| `npm start` | Start the single application process |
| `npm run setup:telegram` | Authorize the personal Telegram account through the CLI |
| `server/` | API, access control, storage, workers, Telegram adapter and CLI |
| `client/` | Preact views and CSS |
| `shared/` | Provider-independent contracts with no runtime dependencies |
| `server/migrations/` | Versioned SQL migrations |

[Operations](docs/operations.md) covers protected configuration, SMTP, HTTPS, process supervision, containers, backups and recovery limits. [Dependency purposes](docs/dependencies.md) records each direct dependency. The agreed [specification](docs/specification.md) and ordered [implementation tasks](docs/implementation-tasks.md) remain in the repository.

Implementation status and recorded checks are in [manual-checks.md](docs/manual-checks.md). Release 1 requires live Telegram, SMTP and mobile-browser acceptance checks. Local simulations do not establish live-provider acceptance. Publication and recurring schedules belong to Phase 2 and follow Release 1 acceptance. No automated test suite or CI is included, as requested.
