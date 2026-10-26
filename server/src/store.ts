import { ruleHeading } from "@monitor/shared";
import { randomUUID } from "node:crypto";
import type {
  Source,
  Rule,
  RuleInput,
  Match,
  IncomingItem,
  EmailJob,
  Activity,
  Page,
  DiscoveredSource,
} from "@monitor/shared";
import { HttpError } from "./http.js";
import { Storage } from "./db.js";
export const now = () => new Date().toISOString();
export class Store {
  constructor(public readonly db: Storage) {}
  sources(): Source[] {
    return this.db
      .all(
        "SELECT s.*,p.position FROM sources s JOIN positions p ON p.source_id=s.id ORDER BY s.name",
      )
      .map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        accountId: r.account_id,
        externalId: r.external_id,
        topicId: r.topic_id || undefined,
        name: r.name,
        kind: r.kind,
        url: r.url || undefined,
        enabled: !!r.enabled,
        position: r.position,
        selectedAt: r.selected_at,
        error: r.error || undefined,
      }));
  }
  source(id: string) {
    return this.sources().find((s) => s.id === id);
  }
  addSource(source: DiscoveredSource, position: string): Source {
    const id = randomUUID();
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO sources(id,owner_id,account_id,external_id,topic_id,name,kind,url,enabled,selected_at) VALUES(?,?,?,?,?,?,?,?,1,?)",
        id,
        "owner",
        "telegram",
        source.externalId,
        source.topicId || "",
        source.name,
        source.kind,
        source.url || null,
        now(),
      );
      this.db.run("INSERT INTO positions VALUES(?,?)", id, position);
    });
    return this.source(id)!;
  }
  setSourceEnabled(id: string, enabled: boolean, position?: string) {
    this.db.transaction(() => {
      this.db.run(
        "UPDATE sources SET enabled=?,error=NULL,selected_at=? WHERE id=?",
        Number(enabled),
        now(),
        id,
      );
      if (position !== undefined)
        this.db.run(
          "UPDATE positions SET position=? WHERE source_id=?",
          position,
          id,
        );
    });
  }
  removeSource(id: string) {
    this.db.transaction(() =>
      this.db.run("DELETE FROM sources WHERE id=?", id),
    );
  }
  sourceError(externalId: string, code: string | null) {
    this.db.run(
      "UPDATE sources SET error=? WHERE external_id=?",
      code,
      externalId,
    );
  }
  rules(): Rule[] {
    return this.db.all("SELECT * FROM rules ORDER BY created_at").map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      sourceIds: this.db
        .all(
          "SELECT source_id FROM rule_sources WHERE rule_id=? ORDER BY source_id",
          r.id,
        )
        .map((s) => s.source_id),
      enabled: !!r.enabled,
      conditions: JSON.parse(r.conditions),
      attachmentTypes: JSON.parse(r.attachment_types),
      createdAt: r.created_at,
    }));
  }
  saveRule(input: RuleInput, id: string = randomUUID()): Rule {
    this.db.transaction(() => {
      if (input.enabled && !input.sourceIds.length)
        throw new HttpError(400, "An enabled rule needs at least one source.");
      if (
        new Set(input.sourceIds).size !== input.sourceIds.length ||
        input.sourceIds.some(
          (sourceId) => this.source(sourceId)?.ownerId !== "owner",
        )
      )
        throw new HttpError(
          400,
          "Select unique existing sources belonging to this owner.",
        );
      const created = this.rules().find((r) => r.id === id)?.createdAt || now();
      this.db.run(
        "INSERT INTO rules(id,owner_id,enabled,conditions,attachment_types,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET conditions=excluded.conditions,attachment_types=excluded.attachment_types",
        id,
        "owner",
        Number(input.enabled),
        JSON.stringify(input.conditions),
        JSON.stringify(input.attachmentTypes),
        created,
      );
      this.db.run("DELETE FROM rule_sources WHERE rule_id=?", id);
      for (const sourceId of input.sourceIds)
        this.db.run("INSERT INTO rule_sources VALUES(?,?)", id, sourceId);
      this.db.run(
        "UPDATE rules SET enabled=? WHERE id=?",
        Number(input.enabled),
        id,
      );
    });
    return this.rules().find((r) => r.id === id)!;
  }
  removeRule(id: string) {
    this.db.run("DELETE FROM rules WHERE id=?", id);
  }
  /** The caller supplies every participating source. No await or external call inside this transaction. */
  commitItem(
    item: IncomingItem,
    sources: Source[],
    matching: Rule[],
    albumId?: string,
    withinTransaction = false,
  ): boolean {
    const work = () => {
      let created = false;
      if (matching.length) {
        const key = this.db.run(
          "INSERT OR IGNORE INTO match_keys VALUES(?,?,?)",
          item.accountId,
          item.externalSourceId,
          item.identity,
        );
        if (key.changes) {
          const match: Match = {
            id: randomUUID(),
            ownerId: "owner",
            accountId: item.accountId,
            externalSourceId: item.externalSourceId,
            identity: item.identity,
            sourceName:
              sources
                .filter(
                  (s) =>
                    s.enabled &&
                    s.accountId === item.accountId &&
                    s.externalId === item.externalSourceId &&
                    (!s.topicId || s.topicId === item.topicId) &&
                    BigInt(item.startPosition || item.position) >
                      BigInt(s.position) &&
                    matching.some((rule) => rule.sourceIds.includes(s.id)),
                )
                .sort((a, b) => Number(!!b.topicId) - Number(!!a.topicId))[0]
                ?.name || "Unavailable",
            sender: item.sender,
            text: item.text,
            url: item.url,
            messageTime: item.eventTime,
            matchedAt: now(),
            ruleNames: [...new Set(matching.map(ruleHeading))],
            attachments: item.attachments,
          };
          this.db.run(
            "INSERT INTO matches VALUES(?,?,?,?,?,?,?)",
            match.id,
            match.ownerId,
            match.accountId,
            match.externalSourceId,
            match.identity,
            JSON.stringify(match),
            match.matchedAt,
          );
          this.db.run(
            "INSERT INTO email_jobs(id,kind,match_id,payload,next_attempt_at) VALUES(?,?,?,?,?)",
            randomUUID(),
            "match",
            match.id,
            JSON.stringify(match),
            now(),
          );
          created = true;
        }
      }
      for (const source of sources)
        if (BigInt(item.position) > BigInt(source.position))
          this.db.run(
            "UPDATE positions SET position=? WHERE source_id=? AND CAST(position AS INTEGER)<CAST(? AS INTEGER)",
            item.position,
            source.id,
            item.position,
          );
      if (albumId)
        this.db.run(
          "DELETE FROM albums WHERE account_id=? AND external_id=? AND album_id=?",
          item.accountId,
          item.externalSourceId,
          albumId,
        );
      return created;
    };
    return withinTransaction ? work() : this.db.transaction(work);
  }
  commitBatch(
    plans: { item: IncomingItem; sources: Source[]; matching: Rule[] }[],
    externalId: string,
    through: string,
  ) {
    this.db.transaction(() => {
      for (const plan of plans)
        this.commitItem(
          plan.item,
          plan.sources,
          plan.matching,
          plan.item.albumId,
          true,
        );
      this.db.run(
        "DELETE FROM recovery_items WHERE account_id=? AND external_id=? AND position<=?",
        "telegram",
        externalId,
        Number(through),
      );
    });
  }
  matches(page = 1, pageSize = 25): Page<Match> {
    const rows = this.db.all(
      "SELECT snapshot FROM matches ORDER BY matched_at DESC,id DESC LIMIT ? OFFSET ?",
      pageSize,
      (page - 1) * pageSize,
    );
    return {
      items: rows.map((r) => this.withDelivery(JSON.parse(r.snapshot))),
      total: Number(this.db.get("SELECT count(*) n FROM matches")!.n),
      page,
      pageSize,
    };
  }
  private withDelivery(match: Match): Match {
    const row = this.db.get(
      "SELECT * FROM email_jobs WHERE match_id=?",
      match.id,
    );
    return { ...match, delivery: row ? this.mapJob(row) : undefined };
  }
  match(id: string) {
    const row = this.db.get("SELECT snapshot FROM matches WHERE id=?", id);
    return row ? this.withDelivery(JSON.parse(row.snapshot)) : undefined;
  }
  deleteMatch(id: string) {
    this.db.transaction(() => {
      this.db.run("DELETE FROM matches WHERE id=?", id);
      this.db.run(
        "UPDATE email_jobs SET payload='{}' WHERE match_id=? AND status='sent'",
        id,
      );
    });
  }
  mapJob(r: Record<string, any>): EmailJob {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      attempts: r.attempts,
      nextAttemptAt: r.next_attempt_at,
      lastError: r.last_error || undefined,
      sentAt: r.sent_at || undefined,
    };
  }
  jobs(page = 1, pageSize = 25): Page<EmailJob> {
    return {
      items: this.db
        .all(
          "SELECT * FROM email_jobs ORDER BY next_attempt_at DESC LIMIT ? OFFSET ?",
          pageSize,
          (page - 1) * pageSize,
        )
        .map((r) => this.mapJob(r)),
      total: Number(this.db.get("SELECT count(*) n FROM email_jobs")!.n),
      page,
      pageSize,
    };
  }
  retryJob(id: string) {
    return (
      this.db.run(
        "UPDATE email_jobs SET status='pending',attempts=0,next_attempt_at=?,last_error=NULL WHERE id=? AND status<>'sent'",
        now(),
        id,
      ).changes > 0
    );
  }
  incident(code: string, key = code) {
    try {
      this.db.transaction(() => {
        const row = this.db.get(
          "SELECT id FROM activity WHERE incident_key=? AND resolved_at IS NULL AND level='error'",
          key,
        );
        if (row) {
          this.db.run(
            "UPDATE activity SET occurrences=occurrences+1,last_seen_at=? WHERE id=?",
            now(),
            row.id,
          );
          return;
        }
        const id = randomUUID();
        const message = incidentMessage(code);
        this.db.run(
          "INSERT INTO activity(id,level,code,incident_key,message,opened_at,last_seen_at) VALUES(?,'error',?,?,?,?,?)",
          id,
          code,
          key,
          message,
          now(),
          now(),
        );
        this.db.run(
          "INSERT INTO email_jobs(id,kind,incident_id,payload,next_attempt_at) VALUES(?,'incident',?,?,?)",
          randomUUID(),
          id,
          JSON.stringify({ code, message, openedAt: now() }),
          now(),
        );
      });
    } catch {
      console.error(
        "Storage unavailable while recording operational incident.",
      );
    }
  }
  resolve(key: string) {
    this.db.run(
      "UPDATE activity SET resolved_at=? WHERE incident_key=? AND resolved_at IS NULL",
      now(),
      key,
    );
  }
  info(code: string, message: string) {
    this.db.run(
      "INSERT INTO activity(id,level,code,message,opened_at,last_seen_at) VALUES(?,'info',?,?,?,?)",
      randomUUID(),
      code,
      message,
      now(),
      now(),
    );
  }
  activity(page = 1, pageSize = 25): Page<Activity> {
    return {
      items: this.db
        .all(
          "SELECT * FROM activity ORDER BY last_seen_at DESC LIMIT ? OFFSET ?",
          pageSize,
          (page - 1) * pageSize,
        )
        .map((r) => ({
          id: r.id,
          level: r.level,
          code: r.code,
          message: r.message,
          occurrences: r.occurrences,
          openedAt: r.opened_at,
          lastSeenAt: r.last_seen_at,
          resolvedAt: r.resolved_at || undefined,
        })),
      total: Number(this.db.get("SELECT count(*) n FROM activity")!.n),
      page,
      pageSize,
    };
  }
  prune() {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    this.db.run(
      "DELETE FROM activity WHERE last_seen_at<? AND (level='info' OR resolved_at IS NOT NULL) AND id NOT IN (SELECT incident_id FROM email_jobs WHERE status<>'sent' AND incident_id IS NOT NULL)",
      cutoff,
    );
    this.db.run("DELETE FROM sessions WHERE expires_at<?", now());
  }
}
function incidentMessage(code: string): string {
  const labels: Record<string, string> = {
    SMTP_DELIVERY:
      "Email delivery failed. Pending jobs will resume when SMTP is available.",
    TELEGRAM_AUTH:
      "Telegram authorization is unavailable. Run the CLI setup and restart.",
    TELEGRAM_WAIT:
      "Telegram requested a wait. The connector will retry after the required delay.",
    TELEGRAM_ACCESS:
      "A Telegram source is inaccessible. Check membership and source access.",
    TELEGRAM_HISTORY:
      "Telegram reports unavailable history. Deleted or inaccessible messages cannot be recovered.",
    TELEGRAM_CONNECTION: "Telegram connection failed. Recovery will retry.",
    MONITORING:
      "Source processing failed. The completed position was retained.",
    STORAGE: "A storage operation failed. Check the persistent volume.",
    PUBLICATION_UNCERTAIN:
      "A publication result is uncertain. Review Telegram and reconcile the run in Posts before retrying.",
    PUBLICATION_DELETE:
      "Previous publication deletion failed. Replacement stopped; correct the cause and retry the run.",
    PUBLICATION_REJECTED:
      "Publication was rejected without sending. Check the error code in publication history, correct the cause and retry.",
    PUBLICATION_PREPARATION:
      "Publication preparation failed before sending. Check the post and destination, then retry.",
    PUBLICATION_PARTIAL:
      "A partial publication was confirmed. The next schedule run will remove its tracked messages before replacement.",
    SCHEDULING:
      "Schedule processing failed. Check storage and publication history.",
    HTTP: "An unexpected API error occurred.",
  };
  return (
    labels[code] ||
    "An operational error occurred. Check configuration and connection status."
  );
}
