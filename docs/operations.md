# Operation

## Runtime and ownership

Use Node.js **24.19.0**, npm workspaces, `npm ci`, then `npm run build`. Run `node server/dist/index.js` or `npm start` from the checkout. Do not use a development Vite server in production. One application process serves the compiled UI and JSON API and starts recovery and email workers without browser access.

Use a dedicated operating-system user. Keep the protected configuration, database, authorized Telegram session and temporary recovery state on persistent **local** storage. The gitignored `data/` directory inside the checkout is supported. New application files are private through umask `0077`; the configuration and session files must have mode `0600`, and the session directory must have mode `0700`.

The application acquires an exclusive SQLite lock through `.monitor.lock` in the database directory before opening the application database. A second instance using the same directory must fail startup. Kernel locks are released on process exit or crash; the lock file may remain. **Never delete or replace the lock file while any instance is running.** Share the same local data volume across container restarts and keep all application instances stopped during maintenance. Network filesystems are not supported for these SQLite files.

## Protected file configuration

Start with [config.example.json](../config.example.json). It deliberately contains invalid Telegram placeholders until edited. By default, the application loads `config.json` from the repository root. Optionally set `MONITOR_CONFIG` to the absolute path of another protected JSON file; this environment variable contains a path, not configuration secrets.

| Field | Meaning |
| --- | --- |
| `password` | Browser access password, 12–1024 characters; use a unique random password |
| `bind`, `port` | Listener address and integer port from 1 to 65535 |
| `publicOrigin` | Exact HTTP or HTTPS browser origin, including port; no path or trailing slash |
| `trustedProxies` | Exact IP addresses of reverse proxies; CIDR ranges and arbitrary forwarded headers are not accepted |
| `databasePath` | SQLite database path; relative paths resolve from the repository root |
| `sessionPath` | Authorized Telegram session path; relative paths resolve from the repository root; different from the database path |
| `telegram.apiId`, `telegram.apiHash` | Operator’s own application credentials from my.telegram.org |
| `smtp.host`, `smtp.port` | SMTP server and port |
| `smtp.secure` | `true` for implicit TLS, usually port 465; `false` requires STARTTLS, usually port 587 |
| `smtp.user`, `smtp.password` | SMTP authentication; use empty strings only when the SMTP service explicitly supports unauthenticated submission |
| `smtp.from`, `smtp.to` | One sender address and one recipient address; display names and address lists are not supported |

HTTP mode accepts loopback, private IPv4 (10/8, 172.16/12, 192.168/16), IPv4 link-local, and IPv6 unique-local/link-local connections. For LAN access, set `bind: "0.0.0.0"` (or the LAN interface address) and `publicOrigin: "http://192.168.1.20:3000"` using the server’s actual LAN address or hostname. HTTPS mode expects a configured trusted proxy and `X-Forwarded-Proto: https`. The server does not terminate TLS itself. Session cookies use HttpOnly and SameSite=Strict, plus Secure in HTTPS mode. Sessions expire after seven days; logout invalidates the current server session. Writes require the configured request origin. Login attempts and request sizes are limited.

The API returns only safe configuration status. Credentials and storage paths are never sent to the browser build. Change file configuration while the application is stopped, then restart. Source selections and rules are managed through the UI.

## Telegram credentials and QR setup

1. Obtain `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org). QR login still requires these application credentials.
2. Configure their values and a private session directory (for example, `data/telegram`). Stop the application before CLI authorization or reconnection.
3. Run `MONITOR_CONFIG=/absolute/path/config.json npm run setup:telegram` in an interactive terminal.
4. Open Telegram → Settings → Devices → Link Desktop Device and scan the displayed QR. Expired tokens refresh automatically. Treat the QR as a temporary authorization secret.
5. Enter the two-step verification password in the terminal if requested. Input is hidden and the password is not saved.
6. Start the application and check Connectors. Restart should reuse the saved session without login.

If the session is invalid or revoked, Connectors displays reconnection instructions. Stop the process, repeat CLI setup, then restart. The adapter uses bounded connection retries and waits for Telegram flood-wait responses. Available dialogs are loaded after reconnect to rebuild the adapter’s private entity cache. Do not delete a session to troubleshoot an unrelated SMTP or source-access problem.

In Sources, refresh discovery to see accessible groups, channels, private chats and forum topics. Select only sources the account can access. First enable and re-enable save the current position, excluding earlier messages and disabled periods. Disabling or removing sources preserves existing stored matches; removing a source removes its rules.

## SMTP and incidents

Use SMTP with a valid TLS certificate. STARTTLS is mandatory when `secure` is false; certificate verification is never disabled. The worker sends required match fields in plain text and escaped HTML, without media attachments. Each queued job retains its own immutable message snapshot, so deleting a match does not cancel queued delivery. After SMTP acceptance, the job payload is cleared; delivery status remains available.

Temporary match-email failures keep retrying with increasing delays starting at 15 seconds and capped at one hour, including after restart. Permanent authentication or SMTP rejection failures require manual retry. Open Activity Log → Email delivery or the match detail to inspect attempts, the next attempt time and a safe error code, then retry after correcting the cause. Jobs already marked failed require manual retry.

Incident alerts remain pending until SMTP works. Repeated occurrences of an open incident increment its count rather than creating another alert job. A failed alert does not recursively generate more alerts. SMTP acceptance marks a job sent; inbox delivery cannot be confirmed. An uncertain result can cause a duplicate email even with a stable Message-ID. Delivery is at least once.

Operational activity older than 30 days is pruned. Open incidents and activity referenced by pending delivery jobs remain. Matched content stays until manually deleted. Errors use safe codes without credentials, session values or message bodies. Database failures fall back to stderr. A stopped or killed process cannot email its own failure; use an external service supervisor or host monitor for that case.

## Posts and schedules

Open **More → Posts** to create reusable plain text and ordered JPEG/PNG images. Limits: 4096 text characters, or 1024 with images; ten images; 5 MiB each and 20 MiB total. Image signatures, dimensions and declared types are checked; Telegram validates media during upload. Images live in SQLite and are included in stopped-process backups. Image previews require login. Posts used by publication history cannot be deleted. Queued, running and uncertain runs prevent editing their post. Failed runs do not block edits: retry uses the original text/images, while new publications use the edited post. Images retained for failed retries are removed when no unfinished run needs them.

Choose a group or forum topic already selected in Sources. **Publish now** sends once from the personal account. **More → Schedules** creates daily, weekly or monthly UTC publication. Monthly dates clamp to month end while preserving the original day. Pause survives restart and leaves queued recurring work paused; an in-progress run may finish. Run Now works while paused and leaves the next recurring time unchanged. Resume runs one overdue publication, then returns to the original calendar. Runs are serialized.

Each scheduled run deletes only its recorded previous message IDs before publishing. All album IDs and deletion checkpoints are retained. Already-missing messages count as deleted. A deletion failure stops replacement and queues an incident email. Check **Posts → Publication history**, correct the cause, then retry the failed run. Queued or failed runs can be cancelled; cancellation does not restore deleted messages.

Preparation failures and explicit Telegram client-error rejections become **failed**, with safe provider error codes and manual retry. Interrupted or ambiguous sends become **uncertain** and block that schedule. Check the destination in Telegram, then use **Save reviewed result** to confirm every message ID, including album members, or confirm that nothing was sent. Supplied IDs are checked against outgoing message, time, text, topic and album metadata; the operator must confirm they belong to this system run. Known IDs cannot be discarded. Confirmed partial albums become the next replacement's deletion target. Confirmed absence allows retry or cancellation and preserves the original error code. Uncertain runs are never automatically resent. See [ADR 0004](adr/0004-durable-publication-runs.md) and [ADR 0005](adr/0005-utc-calendar-schedules.md).

Restart after building to apply the publication migration and start workers. Increase existing reverse-proxy request limits to 28 MiB for image posts; other API bodies retain their smaller application limits. No browser is needed for schedules or email workers.

## HTTPS reverse proxy

Keep the application listener private. For a regular process on the same VPS, use `bind: "127.0.0.1"`, `publicOrigin: "https://monitor.example.com"`, and `trustedProxies: ["127.0.0.1"]`. Replace the example domain and certificate paths in [nginx.example.conf](nginx.example.conf).

The proxy must overwrite `X-Forwarded-Proto` and `X-Forwarded-For`, preserve the public Host, and serve the UI and API from the same origin. Only configured proxy socket addresses are trusted. Do not expose port 3000 directly to the Internet or set a broad list of trusted proxies. The application checks forwarded connection information rather than assuming all incoming HTTP arrived over HTTPS.

[personal-monitor.service](personal-monitor.service) is an example systemd unit. Adjust paths, the runtime user and the pinned Node binary location. Ensure that user owns the protected configuration and persistent directory before starting it. A 60-second supervisor stop timeout leaves time for graceful connector and email shutdown.

## Optional container

Build the pinned image:

```sh
docker build -t personal-monitor:local .
```

In a managed environment that supplies a proxy CA, keep the configured proxy and pass the CA only as a BuildKit secret:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t personal-monitor:local .
```

The optional CA mount is used only during networked npm steps and is not copied into the image. Runtime services that need a private CA require a separate read-only CA mount and `NODE_EXTRA_CA_CERTS`; keep normal certificate verification enabled.

The image runs as UID/GID `1000`. Prepare a host data directory and a protected container configuration owned by that identity. Bind-mounts retain host permissions; the Dockerfile cannot repair a mounted directory’s ownership.

For a bridged container behind a host HTTPS proxy, change these fields in a copy of the protected configuration:

```json
{
  "bind": "0.0.0.0",
  "publicOrigin": "https://monitor.example.com",
  "trustedProxies": ["172.17.0.1"],
  "databasePath": "/data/monitor.sqlite",
  "sessionPath": "/data/telegram/session"
}
```

Keep the other required fields from the full example. The proxy IP above is illustrative: configure the actual source address seen from your chosen Docker network. A host proxy reaching a published container port commonly appears as the bridge gateway. A proxy container has its own network IP. Trust only the exact proxy addresses. Publish the HTTP port on host loopback and let the HTTPS proxy reach it.

```sh
install -d -m 700 /srv/personal-monitor/data/telegram
# Set ownership to the dedicated runtime identity before starting the container.
sudo chown -R 1000:1000 /srv/personal-monitor/data
sudo chown 1000:1000 /srv/personal-monitor/container-config.json
sudo chmod 600 /srv/personal-monitor/container-config.json

docker run --rm -it --init \
  --mount type=bind,src=/srv/personal-monitor/data,dst=/data \
  --mount type=bind,src=/srv/personal-monitor/container-config.json,dst=/config/config.json,readonly \
  personal-monitor:local node server/dist/cli.js

docker run -d --init --name personal-monitor --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --mount type=bind,src=/srv/personal-monitor/data,dst=/data \
  --mount type=bind,src=/srv/personal-monitor/container-config.json,dst=/config/config.json,readonly \
  personal-monitor:local
```

Do not run the CLI setup and application containers together. The session directory on the host must be mode `0700`. `docker stop --time 60 personal-monitor` permits graceful shutdown. Recreate or restart the application container to apply file configuration changes. Keep `/data` persistent and reuse it on restart. The health check requests the local health endpoint using the configured port; it does not disclose configuration.

For LAN container HTTP use, bind the application to `0.0.0.0`, publish its port on the host LAN address and set `publicOrigin` to the exact browser origin. Private bridge addresses are accepted in HTTP mode.

## Backup and restart

1. Stop the regular process or application container and confirm it has exited. Stop every instance sharing the volume.
2. Copy the entire persistent data directory, including the database, any SQLite sidecars, session directory and lock file. Copy the protected configuration separately with its private permissions.
3. Store the backup privately. The authorized session grants account access and is not encrypted by the application.
4. Start one application instance with the same configuration and data paths. Pending email jobs resume and missed available Telegram history is recovered without opening a browser.

Do not copy only a live SQLite database file while WAL writes continue. Do not delete the lock database during operation. Automated backup, restore and session encryption are deferred work.

## Recovery limits and release checks

Recovery has no configured age cutoff. The completed position advances for unmatched items as well as matches; incomplete albums and temporary history buffers survive restart. Canonical item identities prevent duplicate database notifications across live recovery and forum/topic overlap. Recovered items use the rules active at processing time. Message edits and deletion events are ignored.

Telegram cannot return messages that were deleted, are outside available history, or belong to a chat the account can no longer access. Those limitations cannot be repaired by retrying indefinitely. Access and reported history failures appear in Activity Log. Messages from before enable or during disabled periods are intentionally excluded.

The requested GramJS dependency is pinned. Its npm package currently reports that upstream maintenance moved to a fork; adopting a replacement requires a separate compatibility review. The Node 24 SQLite API is isolated in the storage module because it is a release-candidate API.

Before accepting Release 1, manually verify real QR login and saved-session restart; source and topic discovery; two rules yielding one notification and email; optional versus required images; downtime recovery and duplicates; SMTP outage/retry; invalid authorization; retained matches; phone-width source/rule setup; Safari and Chromium; keyboard navigation; mobile login/logout; regular-process and container persistence. Record the provider and browser checks actually performed. Local fixtures and simulated transports are useful implementation checks, but they do not prove successful real Telegram authorization, inbox delivery, or Safari compatibility. Complete Release 1 acceptance before starting Phase 2 publication and schedules.
