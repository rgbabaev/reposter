import { createServer } from "node:http";
import { dirname } from "node:path";
import { loadConfig } from "./config.js";
import { DataLock, Storage } from "./db.js";
import { Store } from "./store.js";
import { TelegramConnector } from "./adapters/telegram/adapter.js";
import { TelegramNotificationWorker } from "./telegram-notifications.js";
import { EmailWorker } from "./email.js";
import { Monitor } from "./monitor.js";
import { Sources } from "./sources.js";
import { Serial } from "./serial.js";
import { Api } from "./api.js";
import { Publications } from "./publications.js";
import { Schedules } from "./schedules.js";

async function main() {
  process.umask(0o077);
  const config = loadConfig();
  const lock = new DataLock(dirname(config.databasePath));
  let store: Store;
  try {
    store = new Store(
      new Storage(config.databasePath),
      config.telegramNotifications?.enabled
        ? {
            externalId: config.telegramNotifications.externalId!,
            ...(config.telegramNotifications.topicId
              ? {
                  topicId: config.telegramNotifications.topicId,
                }
              : {}),
          }
        : undefined,
    );
  } catch {
    lock.close();
    throw new Error("databasePath: could not open or migrate storage");
  }
  const connector = new TelegramConnector(config);
  const serial = new Serial();
  const sources = new Sources(store, connector, serial);
  const email = new EmailWorker(config, store);
  const telegramNotifications = new TelegramNotificationWorker(
    config.telegramNotifications,
    store,
    connector,
  );
  const wakeNotifications = () => {
    email.wake();
    telegramNotifications.wake();
  };
  const monitor = new Monitor(store, connector, serial, wakeNotifications);
  const publications = new Publications(store, connector, wakeNotifications);
  const schedules = new Schedules(store, publications);
  const api = new Api(
    config,
    store,
    connector,
    sources,
    email,
    publications,
    schedules,
    telegramNotifications,
  );
  const server = createServer((req, res) => {
    void api.handle(req, res);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxRequestsPerSocket = 100;
  let stopping = false;
  let retention: ReturnType<typeof setInterval> | undefined;
  const shutdown = async (failed = false) => {
    if (stopping) return;
    stopping = true;
    if (retention) clearInterval(retention);
    schedules.stop();
    const pending = new Set([
      "HTTP",
      "match images",
      "Telegram",
      "monitoring",
      "email",
      "publication",
      "Telegram notifications",
    ]);
    const track = async (name: string, operation: Promise<unknown>) => {
      await operation;
      pending.delete(name);
    };
    const deadline = setTimeout(() => {
      console.error(
        `Shutdown deadline reached while waiting for ${[...pending].join(", ")}. Durable work resumes after restart.`,
      );
      process.exit(1);
    }, 45_000);
    const stoppedHttp = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    server.closeIdleConnections();
    try {
      const disconnect = connector.stop();
      await Promise.all([
        track("monitoring", monitor.stop()),
        track("Telegram", disconnect),
        track("email", email.stop()),
        track("Telegram notifications", telegramNotifications.stop()),
        track("publication", publications.stop()),
        track("HTTP", stoppedHttp),
        track("match images", api.stop()),
      ]);
      store.db.close();
      lock.close();
      clearTimeout(deadline);
      process.exitCode = failed ? 1 : 0;
    } catch {
      console.error(
        "Graceful shutdown encountered an error. Pending work remains durable.",
      );
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("uncaughtException", () => {
    store.incident("PROCESS_FAILURE");
    console.error("Unexpected process failure; shutting down.");
    void shutdown(true);
  });
  process.once("unhandledRejection", () => {
    store.incident("PROCESS_FAILURE");
    console.error("Unexpected asynchronous failure; shutting down.");
    void shutdown(true);
  });
  server.on("error", () => {
    store.incident("HTTP_LISTEN");
    console.error(
      "HTTP listener failed. Check bind address and port availability.",
    );
    void shutdown(true);
  });
  server.listen(config.port, config.bind, () => {
    console.log("Personal Monitor started. All stored times are UTC.");
    void connector
      .start(
        (id) => {
          if (!stopping) monitor.signal(id);
        },
        (code) => {
          if (!stopping) store.incident(code);
        },
        () => {
          if (stopping) return;
          try {
            for (const code of [
              "TELEGRAM_AUTH",
              "TELEGRAM_CONNECTION",
              "TELEGRAM_WAIT",
            ])
              store.resolve(code);
          } catch {
            console.error(
              "Storage unavailable while resolving connection incident.",
            );
          }
        },
      )
      .catch(() => {
        if (!stopping) store.incident("TELEGRAM_CONNECTION");
      });
    monitor.start();
    email.start();
    telegramNotifications.start();
    publications.start();
    schedules.start();
    const prune = () => {
      try {
        store.prune();
      } catch {
        store.incident("STORAGE");
      }
    };
    prune();
    retention = setInterval(prune, 3600_000);
  });
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Startup failed.");
  process.exitCode = 1;
});
