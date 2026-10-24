# Personal Monitor

Monitor Telegram chats and forum topics with text and attachment rules. Receive matching messages by email.

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

Open the configured `publicOrigin`, sign in, refresh sources, and add rules.

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
