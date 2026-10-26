import { BlockList, isIP } from "node:net";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "./config.js";
import { Store, now } from "./store.js";
import { HttpError, body, json } from "./http.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const lifetime = 7 * 86400_000;
const localNetworks = new BlockList();
for (const [network, prefix] of [
  ["127.0.0.0", 8],
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["169.254.0.0", 16],
] as const)
  localNetworks.addSubnet(network, prefix, "ipv4");
localNetworks.addAddress("::1", "ipv6");
localNetworks.addSubnet("fc00::", 7, "ipv6");
localNetworks.addSubnet("fe80::", 10, "ipv6");
const localAddress = (address: string) => {
  const ip = address.replace(/^::ffff:/i, "").split("%")[0]!;
  const version = isIP(ip);
  return version !== 0 && localNetworks.check(ip, version === 4 ? "ipv4" : "ipv6");
};
export class Auth {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private config: Config,
    private store: Store,
  ) {}
  private trusted(req: IncomingMessage) {
    const ip = req.socket.remoteAddress || "";
    return (
      this.config.trustedProxies.includes(ip) ||
      this.config.trustedProxies.includes(ip.replace(/^::ffff:/, ""))
    );
  }
  transport(req: IncomingMessage) {
    if (this.config.publicOrigin.startsWith("https:"))
      return this.trusted(req) && req.headers["x-forwarded-proto"] === "https";
    return localAddress(req.socket.remoteAddress || "");
  }
  origin(req: IncomingMessage) {
    if (req.headers.origin !== this.config.publicOrigin)
      throw new HttpError(403, "Request origin is not allowed.");
  }
  private cookie(value: string, maxAge: number) {
    return `monitor_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.config.publicOrigin.startsWith("https:") ? "; Secure" : ""}`;
  }
  private clientIp(req: IncomingMessage) {
    if (!this.trusted(req)) return req.socket.remoteAddress || "unknown";
    const chain = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    while (
      chain.length > 1 &&
      this.config.trustedProxies.includes(chain[chain.length - 1]!)
    )
      chain.pop();
    return chain[chain.length - 1] || req.socket.remoteAddress || "unknown";
  }
  private token(req: IncomingMessage) {
    const raw = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("monitor_session="))
      ?.slice(16);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : undefined;
  }
  authenticated(req: IncomingMessage) {
    const token = this.token(req);
    return (
      !!token &&
      !!this.store.db.get(
        "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
        hash(token),
        now(),
      )
    );
  }
  require(req: IncomingMessage) {
    if (!this.authenticated(req)) throw new HttpError(401, "Please sign in.");
  }
  async route(
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    if (path === "/api/login" && req.method === "POST") {
      this.origin(req);
      const ip = this.clientIp(req);
      for (const [key, value] of this.attempts)
        if (value.until < Date.now()) this.attempts.delete(key);
      if (this.attempts.size > 10000)
        throw new HttpError(429, "Too many login attempts. Try again later.");
      const attempt = this.attempts.get(ip);
      if (attempt && attempt.count >= 5)
        throw new HttpError(
          429,
          "Too many login attempts. Try again in 15 minutes.",
        );
      const count = attempt || { count: 0, until: Date.now() + 15 * 60_000 };
      count.count++;
      this.attempts.set(ip, count);
      const input = await body(req, 4096);
      if (typeof input.password !== "string" || input.password.length > 1024)
        throw new HttpError(400, "Password is required.");
      if (
        !timingSafeEqual(
          Buffer.from(hash(input.password), "hex"),
          Buffer.from(hash(this.config.password), "hex"),
        )
      )
        throw new HttpError(401, "Incorrect password.");
      this.attempts.delete(ip);
      const token = randomBytes(32).toString("hex");
      this.store.db.run(
        "INSERT INTO sessions VALUES(?,?)",
        hash(token),
        new Date(Date.now() + lifetime).toISOString(),
      );
      res.setHeader("Set-Cookie", this.cookie(token, lifetime / 1000));
      json(res, 200, { authenticated: true });
      return true;
    }
    if (path === "/api/logout" && req.method === "POST") {
      this.origin(req);
      const token = this.token(req);
      if (token)
        this.store.db.run(
          "DELETE FROM sessions WHERE token_hash=?",
          hash(token),
        );
      res.setHeader("Set-Cookie", this.cookie("", 0));
      json(res, 200, { authenticated: false });
      return true;
    }
    if (path === "/api/session" && req.method === "GET") {
      json(res, 200, { authenticated: this.authenticated(req) });
      return true;
    }
    return false;
  }
}
