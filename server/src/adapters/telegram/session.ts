import { randomUUID } from "node:crypto";
import {
  readFileSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  renameSync,
  statSync,
  lstatSync,
} from "node:fs";
import { dirname } from "node:path";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import type { Config } from "../../config.js";
export function makeClient(config: Config): TelegramClient {
  let session = "";
  try {
    if (lstatSync(config.sessionPath).isSymbolicLink())
      throw new Error("SESSION_SYMLINK");
    if (statSync(config.sessionPath).mode & 0o077)
      throw new Error("SESSION_PERMISSIONS");
    session = readFileSync(config.sessionPath, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("TELEGRAM_AUTH");
  }
  return new TelegramClient(
    new StringSession(session),
    config.telegram.apiId,
    config.telegram.apiHash,
    {
      baseLogger: new Logger(LogLevel.NONE),
      connectionRetries: 3,
      reconnectRetries: 3,
      requestRetries: 2,
      retryDelay: 1000,
      autoReconnect: true,
      floodSleepThreshold: 0,
    },
  );
}
export function saveSession(config: Config, client: TelegramClient) {
  const parent = dirname(config.sessionPath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  // Require a dedicated private directory, rather than modifying arbitrary existing parents.
  if (statSync(parent).mode & 0o077)
    throw new Error("Session directory must be owner-only (0700).");
  const temp = config.sessionPath + "." + randomUUID() + ".new";
  writeFileSync(temp, String(client.session.save()), {
    mode: 0o600,
    flag: "wx",
  });
  chmodSync(temp, 0o600);
  renameSync(temp, config.sessionPath);
  chmodSync(config.sessionPath, 0o600);
}
