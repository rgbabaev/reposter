# Personal Monitor

Monitor Telegram chats and forum topics with text and attachment rules. Receive matches by email. Create reusable posts and schedule publication with replacement in groups and forum topics.

## Setup

Requires Node.js 24.19.0 (`.nvmrc`).

```sh
npm ci
npm run build
install -m 600 config.example.json config.json
```

Edit `config.json`: set your login password, [Telegram API credentials](https://my.telegram.org), and SMTP settings. Set `publicOrigin` to the exact browser origin, including the port (for example, `http://localhost:3000`).

```sh
npm run setup:telegram
```

Scan the QR via **Telegram → Settings → Devices → Link Desktop Device**. If prompted, enter your Telegram two-step verification password—not an OTP.

```sh
npm start
```

For LAN HTTP access, set `bind` to `0.0.0.0` and `publicOrigin` to the server’s LAN origin, such as `http://192.168.1.20:3000`. Restart after configuration changes.

Open the configured `publicOrigin`, sign in, refresh sources, and add rules.

Use **More → Posts** to create text/image posts and publish now. Use **More → Schedules** for recurring UTC publication. Review interrupted or uncertain sends in **Posts → Publication history** before retrying.

## Configuration

- Defaults to the repository’s `config.json`; override with `MONITOR_CONFIG=/absolute/path/config.json`.
- Relative `databasePath` and `sessionPath` values resolve from the repository root. The example uses gitignored `data/`.
- Config and session files require mode `0600`; the session directory requires `0700`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build server and UI |
| `npm run check` | Check TypeScript |
| `npm run setup:telegram` | Authorize Telegram |
| `npm start` | Start the application |

See [operations](docs/operations.md) for HTTPS, deployment, backups, and recovery; [manual checks](docs/manual-checks.md) for validation status.

Remaining live acceptance checks: [operator checklist](docs/update-checks.md).

Optional Telegram reports use the existing account alongside email. Configure `telegramNotifications` as described in [operations](docs/operations.md#telegram-notification-reports), then restart. Match details and Activity Log show both delivery channels and retries.

Switch email and Telegram delivery independently in **More → Settings → Notification channels**. Changes persist and apply immediately; paused queues resume when re-enabled.
