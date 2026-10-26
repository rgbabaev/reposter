import { isIP } from "node:net";
import { readFileSync, statSync, lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export interface Config {
  password: string;
  bind: string;
  port: number;
  publicOrigin: string;
  trustedProxies: string[];
  databasePath: string;
  sessionPath: string;
  telegram: { apiId: number; apiHash: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    to: string;
  };
}
export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export function loadConfig(
  path = process.env.MONITOR_CONFIG || resolve(repositoryRoot, "config.json"),
): Config {
  if (!isAbsolute(path))
    throw new Error("MONITOR_CONFIG: must be an absolute path");
  let value: unknown;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.mode & 0o077) throw new Error();
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      "configuration: must be valid JSON in an owner-only (0600) regular file",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("configuration: must be an object");
  const x = value as Record<string, any>;
  const errors: string[] = [];
  const check = (ok: boolean, field: string, message: string) => {
    if (!ok) errors.push(`${field}: ${message}`);
  };
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const port = (v: unknown) =>
    Number.isInteger(v) && Number(v) > 0 && Number(v) < 65536;
  check(
    typeof x.password === "string" &&
      x.password.length >= 12 &&
      x.password.length <= 1024,
    "password",
    "must contain 12–1024 characters",
  );
  check(
    typeof x.bind === "string" &&
      (isIP(x.bind) !== 0 ||
        /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(x.bind)),
    "bind",
    "must be a hostname or IP address",
  );
  check(port(x.port), "port", "must be an integer from 1 to 65535");
  let origin: URL | undefined;
  try {
    origin = new URL(x.publicOrigin);
  } catch {
    /* field error below */
  }
  check(
    !!origin &&
      origin.origin === x.publicOrigin &&
      !origin.username &&
      !origin.password &&
      (origin.protocol === "https:" ||
        origin.protocol === "http:"),
    "publicOrigin",
    "must be an HTTP or HTTPS origin with no path or trailing slash",
  );
  check(
    Array.isArray(x.trustedProxies) &&
      x.trustedProxies.every(
        (p: unknown) => typeof p === "string" && isIP(p) !== 0,
      ),
    "trustedProxies",
    "must list exact proxy IP addresses",
  );
  if (origin?.protocol === "https:")
    check(
      Array.isArray(x.trustedProxies) && x.trustedProxies.length > 0,
      "trustedProxies",
      "HTTPS requires at least one trusted reverse proxy IP",
    );
  for (const key of ["databasePath", "sessionPath"]) {
    check(text(x[key]), key, "must be a non-empty path");
    if (text(x[key])) x[key] = resolve(repositoryRoot, x[key]);
  }
  if (text(x.sessionPath)) {
    try {
      check(
        !lstatSync(x.sessionPath).isSymbolicLink(),
        "sessionPath",
        "must not be a symbolic link",
      );
    } catch {
      /* new file */
    }
  }
  check(
    Number.isInteger(x.telegram?.apiId) && x.telegram.apiId > 0,
    "telegram.apiId",
    "must be a positive application ID from my.telegram.org",
  );
  check(
    typeof x.telegram?.apiHash === "string" &&
      /^[a-f\d]{32}$/i.test(x.telegram.apiHash),
    "telegram.apiHash",
    "must be a 32-character application hash",
  );
  check(
    typeof x.databasePath === "string" &&
      typeof x.sessionPath === "string" &&
      resolve(x.databasePath) !== resolve(x.sessionPath),
    "sessionPath",
    "must differ from databasePath",
  );
  const smtp = x.smtp;
  check(text(smtp?.host), "smtp.host", "is required");
  check(port(smtp?.port), "smtp.port", "must be a valid port");
  check(
    typeof smtp?.secure === "boolean",
    "smtp.secure",
    "must be boolean (false uses required STARTTLS)",
  );
  check(
    typeof smtp?.user === "string" && typeof smtp?.password === "string",
    "smtp",
    "user and password must be strings",
  );
  for (const field of ["from", "to"])
    check(
      typeof smtp?.[field] === "string" &&
        /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(smtp[field]),
      `smtp.${field}`,
      "must be one email address",
    );
  if (errors.length) throw new Error(errors.join("\n"));
  return x as unknown as Config;
}
