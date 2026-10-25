import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import type { EmailWorker } from "./email.js";
import { validateRule } from "./rules.js";
import { Sources } from "./sources.js";
import { ProviderError } from "./connector.js";
import type { Connector } from "./connector.js";
import { Store } from "./store.js";
import { Auth } from "./auth.js";
import { HttpError, json, securityHeaders, body, pagination } from "./http.js";
import { PublicationApi } from "./publication-api.js";
import type { Publications } from "./publications.js";
import type { Schedules } from "./schedules.js";
export class Api {
  private auth: Auth;
  private publicationApi?: PublicationApi;
  constructor(
    private config: Config,
    private store: Store,
    private connector?: Connector,
    private sources?: Sources,
    private email?: EmailWorker,
    publications?: Publications,
    schedules?: Schedules,
  ) {
    this.auth = new Auth(config, store);
    if (publications && schedules)
      this.publicationApi = new PublicationApi(publications, schedules);
  }
  async handle(req: IncomingMessage, res: ServerResponse) {
    securityHeaders(res);
    try {
      const url = new URL(req.url || "/", this.config.publicOrigin);
      const path = url.pathname;
      if (path === "/health" && req.method === "GET") {
        json(res, 200, {
          status: this.store.db.get("SELECT 1") ? "ok" : "unavailable",
        });
        return;
      }
      if (!this.auth.transport(req))
        throw new HttpError(
          400,
          "Use the configured HTTPS origin or a loopback connection.",
        );
      if (path.startsWith("/api/")) {
        if (await this.auth.route(path, req, res)) return;
        this.auth.require(req);
        if (!["GET", "HEAD"].includes(req.method || "")) this.auth.origin(req);
        if (await this.publicationApi?.route(url, req, res)) return;
        const { page, pageSize } = pagination(url);
        const slice = <T>(items: T[]) => ({
          items: items.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: items.length,
        });
        if (path === "/api/sources" && req.method === "GET") {
          json(res, 200, slice(this.store.sources()));
          return;
        }
        if (path === "/api/discovery" && req.method === "GET") {
          json(res, 200, slice(this.sources?.discovery() || []));
          return;
        }
        if (path === "/api/sources/refresh" && req.method === "POST") {
          if (!this.sources) throw new HttpError(503, "Connector unavailable.");
          await this.sources.refresh();
          json(res, 200, { refreshed: true });
          return;
        }
        if (path === "/api/sources" && req.method === "POST") {
          if (!this.sources) throw new HttpError(503, "Connector unavailable.");
          const input = await body(req);
          json(
            res,
            201,
            await this.sources.select(input.externalId, input.topicId),
          );
          return;
        }
        const sourceRoute = path.match(/^\/api\/sources\/([^/]+)$/);
        if (sourceRoute && req.method === "PATCH") {
          const input = await body(req);
          json(
            res,
            200,
            await this.sources!.enable(sourceRoute[1]!, input.enabled),
          );
          return;
        }
        if (sourceRoute && req.method === "DELETE") {
          await this.sources!.remove(sourceRoute[1]!);
          json(res, 200, { deleted: true });
          return;
        }
        if (path === "/api/rules" && req.method === "GET") {
          json(res, 200, slice(this.store.rules()));
          return;
        }
        const ruleRoute = path.match(/^\/api\/rules\/([^/]+)$/);
        if (ruleRoute && req.method === "GET") {
          const rule = this.store.rules().find((r) => r.id === ruleRoute[1]);
          if (!rule) throw new HttpError(404, "Rule not found.");
          json(res, 200, rule);
          return;
        }
        if (
          (path === "/api/rules" && req.method === "POST") ||
          (ruleRoute && req.method === "PUT")
        ) {
          const input = validateRule(await body(req));

          if (
            ruleRoute &&
            !this.store.rules().some((r) => r.id === ruleRoute[1])
          )
            throw new HttpError(404, "Rule not found.");
          json(
            res,
            ruleRoute ? 200 : 201,
            this.store.saveRule(input, ruleRoute?.[1]),
          );
          return;
        }
        if (ruleRoute && req.method === "DELETE") {
          this.store.removeRule(ruleRoute[1]!);
          json(res, 200, { deleted: true });
          return;
        }
        if (path === "/api/matches" && req.method === "GET") {
          json(res, 200, this.store.matches(page, pageSize));
          return;
        }
        const matchRoute = path.match(/^\/api\/matches\/([^/]+)$/);
        if (matchRoute && req.method === "GET") {
          const match = this.store.match(matchRoute[1]!);
          if (!match) throw new HttpError(404, "Match not found.");
          json(res, 200, match);
          return;
        }
        if (matchRoute && req.method === "DELETE") {
          this.store.deleteMatch(matchRoute[1]!);
          json(res, 200, { deleted: true });
          return;
        }
        if (path === "/api/activity" && req.method === "GET") {
          json(res, 200, this.store.activity(page, pageSize));
          return;
        }
        if (path === "/api/jobs" && req.method === "GET") {
          json(res, 200, this.store.jobs(page, pageSize));
          return;
        }
        const retryRoute = path.match(/^\/api\/jobs\/([^/]+)\/retry$/);
        if (retryRoute && req.method === "POST") {
          if (!this.store.retryJob(retryRoute[1]!))
            throw new HttpError(404, "Pending or failed email job not found.");
          this.email?.wake();
          json(res, 200, { queued: true });
          return;
        }
        if (path === "/api/dashboard" && req.method === "GET") {
          const count = (sql: string) => Number(this.store.db.get(sql)!.n);
          json(res, 200, {
            sources: this.store.sources().length,
            enabledSources: this.store.sources().filter((s) => s.enabled)
              .length,
            rules: this.store.rules().length,
            matches: count("SELECT count(*) n FROM matches"),
            pendingEmails: count(
              "SELECT count(*) n FROM email_jobs WHERE status='pending'",
            ),
            failedEmails: count(
              "SELECT count(*) n FROM email_jobs WHERE status='failed'",
            ),
            incidents: count(
              "SELECT count(*) n FROM activity WHERE level='error' AND resolved_at IS NULL",
            ),
            connector: this.connector?.status(),
          });
          return;
        }
        if (path === "/api/connector" && req.method === "GET") {
          json(res, 200, this.connector?.status() || { state: "disconnected" });
          return;
        }
        if (path === "/api/settings" && req.method === "GET") {
          json(res, 200, {
            publicOrigin: this.config.publicOrigin,
            timezone: "UTC",
            smtpConfigured: !!this.config.smtp.host,
            telegramConfigured: !!this.config.telegram.apiId,
            sessionDays: 7,
            configChangesRequireRestart: true,
          });
          return;
        }
        throw new HttpError(404, "API route not found.");
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(405, "Method not allowed.");
      const root = resolve(
        fileURLToPath(new URL("../../client/dist/", import.meta.url)),
      );
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        throw new HttpError(400, "Invalid path.");
      }
      const asset = resolve(root, "." + decoded);
      if (!asset.startsWith(root + sep) && asset !== root)
        throw new HttpError(404, "Page not found.");
      const file = extname(decoded) ? asset : resolve(root, "index.html");
      let content: Buffer;
      try {
        content = await readFile(file);
      } catch {
        throw new HttpError(404, "Page not found.");
      }
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control":
          extname(file) === ".html"
            ? "no-cache"
            : "public, max-age=31536000, immutable",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof ProviderError) {
        if (error.code !== "TELEGRAM_STOPPED") this.store.incident(error.code);
        json(res, 503, {
          error:
            error.code === "TELEGRAM_AUTH"
              ? "Telegram authorization required. Run the CLI setup."
              : "Telegram is unavailable. Check connector status and activity.",
        });
      } else if (error instanceof HttpError)
        json(res, error.status, { error: error.message });
      else {
        this.store.incident("HTTP");
        json(res, 500, { error: "An unexpected server error occurred." });
      }
    }
  }
}
