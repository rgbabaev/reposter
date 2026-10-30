import { postHeading } from "@monitor/shared";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  Page,
  Post,
  PublicationDestination,
  PublicationRun,
} from "@monitor/shared";
import type { Connector, PublicationRequest } from "./connector.js";
import { ProviderError, PublicationError } from "./connector.js";
import { HttpError } from "./http.js";
import { Posts } from "./posts.js";
import { Store, now } from "./store.js";
import { nextOccurrence } from "./calendar.js";

export class Publications {
  readonly posts: Posts;
  private stopped = true;
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(
    private store: Store,
    private connector: Connector,
    private onChange: () => void = () => {},
  ) {
    this.posts = new Posts(store);
  }
  destination(sourceId: unknown): PublicationDestination {
    const source =
      typeof sourceId === "string" ? this.store.source(sourceId) : undefined;
    if (!source || (source.kind !== "group" && source.kind !== "topic"))
      throw new HttpError(400, "Select a group or forum topic from Sources.");
    return {
      externalId: source.externalId,
      topicId: source.topicId,
      name: source.name,
      kind: source.kind,
    };
  }
  list(page = 1, pageSize = 25): Page<PublicationRun> {
    return {
      items: this.store.db
        .all(
          "SELECT * FROM publication_runs ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
          pageSize,
          (page - 1) * pageSize,
        )
        .map((row) => this.map(row)),
      total: Number(
        this.store.db.get("SELECT count(*) n FROM publication_runs")!.n,
      ),
      page,
      pageSize,
    };
  }
  get(id: string): PublicationRun {
    return this.map(this.row(id));
  }
  private row(id: string) {
    const row = this.store.db.get(
      "SELECT * FROM publication_runs WHERE id=?",
      id,
    );
    if (!row) throw new HttpError(404, "Publication run not found.");
    return row;
  }
  private map(row: Record<string, any>): PublicationRun {
    return {
      id: row.id,
      accountId: row.account_id,
      scheduleId: row.schedule_id || undefined,
      postId: row.post_id,
      postName:
        (JSON.parse(row.snapshot) as { name?: string }).name ??
        postHeading(JSON.parse(row.snapshot)),
      destination: JSON.parse(row.destination),
      status: row.status,
      previousDestination: row.previous_destination
        ? JSON.parse(row.previous_destination)
        : undefined,
      previousIds: JSON.parse(row.previous_ids),
      deletedIds: JSON.parse(row.deleted_ids),
      sentIds: JSON.parse(row.sent_ids),
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      error: row.error || undefined,
    };
  }
  connected() {
    return this.connector.status().state === "connected";
  }
  queue(
    postId: unknown,
    destination: PublicationDestination,
    scheduleId?: string,
    previousIds: string[] = [],
    trigger = "once",
    previousDestination?: PublicationDestination,
  ): PublicationRun {
    if (typeof postId !== "string")
      throw new HttpError(400, "A post is required.");
    if (
      !this.connector.publish ||
      !this.connector.status().capabilities.publication
    )
      throw new HttpError(503, "This connector cannot publish.");
    const post = this.posts.get(postId);
    const id = randomUUID();
    const randomIds = Array.from(
      { length: Math.max(1, post.images.length) },
      () => randomBytes(8).readBigInt64LE().toString(),
    );
    this.store.db.run(
      "INSERT INTO publication_runs(id,owner_id,schedule_id,post_id,snapshot,destination,status,previous_ids,random_ids,created_at,trigger,previous_destination) VALUES(?,?,?,?,?,?,'queued',?,?,?,?,?)",
      id,
      "owner",
      scheduleId || null,
      postId,
      JSON.stringify(post),
      JSON.stringify(destination),
      JSON.stringify(previousIds),
      JSON.stringify(randomIds),
      now(),
      trigger,
      JSON.stringify(previousDestination || destination),
    );
    return this.get(id);
  }
  remove(id: string) {
    this.store.db.transaction(() => {
      const run = this.get(id);
      if (!["sent", "partial", "cancelled"].includes(run.status))
        throw new HttpError(
          409,
          "Only completed publication history can be deleted. Cancel or review unfinished runs first.",
        );
      this.store.db.run("DELETE FROM publication_runs WHERE id=?", id);
      this.posts.pruneImages(run.postId);
    });
  }
  retry(id: string) {
    const run = this.get(id);
    if (run.status !== "failed")
      throw new HttpError(
        409,
        "Only failed runs can be retried. Review uncertain results first.",
      );
    this.store.db.run(
      "UPDATE publication_runs SET status='queued',error=NULL,completed_at=NULL WHERE id=?",
      id,
    );
    this.wake();
    return this.get(id);
  }
  cancel(id: string) {
    const run = this.get(id);
    if (run.status !== "queued" && run.status !== "failed")
      throw new HttpError(
        409,
        "Only queued or failed runs can be cancelled. Review uncertain results first.",
      );
    this.store.db.transaction(() => {
      this.store.db.run(
        "UPDATE publication_runs SET status='cancelled',completed_at=? WHERE id=?",
        now(),
        id,
      );
      if (run.scheduleId)
        this.store.db.run(
          "UPDATE schedules SET previous_ids=?,previous_destination=? WHERE id=?",
          JSON.stringify(
            run.previousIds.filter(
              (messageId) => !run.deletedIds.includes(messageId),
            ),
          ),
          JSON.stringify(run.previousDestination || run.destination),
          run.scheduleId,
        );
    });
    this.store.resolve("publication:" + id);
    this.posts.pruneImages(run.postId);
    this.store.info(
      "PUBLICATION_CANCELLED",
      "An operator cancelled a publication run.",
    );
    return this.get(id);
  }
  private request(row: Record<string, any>): PublicationRequest {
    const post = JSON.parse(row.snapshot) as Post;
    return {
      destination: JSON.parse(row.destination),
      text: post.text,
      entities: post.entities ?? [],
      images: post.images.map((image) => this.posts.image(image.id)),
      randomIds: JSON.parse(row.random_ids),
    };
  }
  async reconcile(id: string, input: Record<string, unknown>) {
    const run = this.get(id);
    if (run.status !== "uncertain")
      throw new HttpError(409, "This run does not require review.");
    if (
      input.confirmed !== true ||
      !Array.isArray(input.messageIds) ||
      !input.messageIds.every(
        (id) =>
          typeof id === "string" &&
          /^[1-9]\d{0,9}$/.test(id) &&
          Number(id) <= 2147483647,
      )
    )
      throw new HttpError(
        400,
        "Confirm the Telegram result and provide its message IDs, or an empty list if nothing was sent.",
      );
    const ids = [...new Set(input.messageIds)] as string[];
    const row = this.row(id);
    const request = this.request(row);
    if (
      ids.length > request.randomIds.length ||
      run.sentIds.some((id) => !ids.includes(id))
    )
      throw new HttpError(
        400,
        "Include every known sent message ID, without exceeding the post's message count.",
      );
    if (ids.length) {
      if (!this.connector.verifyPublication)
        throw new HttpError(503, "Publication verification unavailable.");
      await this.connector.verifyPublication(
        request,
        ids,
        run.startedAt || run.createdAt,
      );
    }
    if (this.get(id).status !== "uncertain")
      throw new HttpError(409, "This run has already been reviewed.");
    const status =
      ids.length === request.randomIds.length
        ? "sent"
        : ids.length
          ? "partial"
          : "failed";
    this.finish(
      id,
      ids,
      status,
      status === "sent" ? null : run.error || "PUBLICATION_REVIEWED",
    );
    this.store.info(
      "PUBLICATION_REVIEWED",
      "An operator reconciled a publication result against Telegram.",
    );
    return this.get(id);
  }
  private finish(
    id: string,
    ids: string[],
    status: "sent" | "partial" | "failed",
    error: string | null = null,
  ) {
    const row = this.row(id);
    const completedAt = now();
    this.store.db.transaction(() => {
      this.store.db.run(
        "UPDATE publication_runs SET status=?,sent_ids=?,completed_at=?,error=? WHERE id=?",
        status,
        JSON.stringify(ids),
        completedAt,
        error,
        id,
      );
      if (row.schedule_id)
        this.store.db.run(
          "UPDATE schedules SET previous_ids=?,previous_destination=? WHERE id=?",
          JSON.stringify(ids),
          row.destination,
          row.schedule_id,
        );
      if (row.schedule_id && status !== "failed") {
        const schedule = this.store.db.get(
          "SELECT calendar,next_run_at FROM schedules WHERE id=?",
          row.schedule_id,
        )!;
        const calendar = JSON.parse(schedule.calendar);
        this.store.db.run(
          "UPDATE schedules SET last_published_at=?,next_run_at=? WHERE id=?",
          completedAt,
          calendar.frequency === "hourly" || row.trigger === "scheduled"
            ? nextOccurrence(calendar, new Date(completedAt))
            : schedule.next_run_at,
          row.schedule_id,
        );
      }
    });
    this.store.resolve("publication:" + id);
    this.posts.pruneImages(row.post_id);
    if (status === "partial")
      this.store.incident("PUBLICATION_PARTIAL", "publication:" + id);
    this.onChange();
  }
  start() {
    for (const row of this.store.db.all(
      "SELECT id FROM publication_runs WHERE status='publishing'",
    )) {
      this.store.db.run(
        "UPDATE publication_runs SET status='uncertain',error='PUBLICATION_UNCERTAIN' WHERE id=?",
        row.id,
      );
      this.store.incident("PUBLICATION_UNCERTAIN", "publication:" + row.id);
    }
    this.stopped = false;
    this.timer = setInterval(() => this.wake(), 1000);
    this.wake();
  }
  wake() {
    if (
      this.stopped ||
      this.active ||
      this.connector.status().state !== "connected"
    )
      return;
    this.active = this.pump()
      .catch(() => this.store.incident("STORAGE"))
      .finally(() => {
        this.active = undefined;
      });
  }
  private async pump() {
    while (!this.stopped && this.connector.status().state === "connected") {
      const row = this.store.db.get(
        "SELECT r.* FROM publication_runs r LEFT JOIN schedules s ON s.id=r.schedule_id WHERE r.status IN ('queued','deleting') AND (r.schedule_id IS NULL OR r.trigger='manual' OR (s.paused=0 AND s.deleted_at IS NULL)) ORDER BY r.created_at,r.id LIMIT 1",
      );
      if (!row) return;
      let preparing = false;
      try {
        this.store.db.run(
          "UPDATE publication_runs SET status='deleting',started_at=COALESCE(started_at,?) WHERE id=?",
          now(),
          row.id,
        );
        const run = this.get(row.id);
        const deleted = new Set(run.deletedIds);
        for (const messageId of run.previousIds) {
          if (this.stopped) return;
          if (deleted.has(messageId)) continue;
          if (!this.connector.deletePublication)
            throw new ProviderError("PUBLICATION_DELETE");
          await this.connector.deletePublication(
            run.previousDestination || run.destination,
            [messageId],
          );
          deleted.add(messageId);
          this.store.db.run(
            "UPDATE publication_runs SET deleted_ids=? WHERE id=?",
            JSON.stringify([...deleted]),
            row.id,
          );
        }
        if (this.stopped) return;
        preparing = true;
        const request = this.request(row);
        this.store.db.run(
          "UPDATE publication_runs SET status='publishing' WHERE id=?",
          row.id,
        );
        const ids = await this.connector.publish!(request, (ids) => {
          this.store.db.run(
            "UPDATE publication_runs SET sent_ids=? WHERE id=?",
            JSON.stringify(ids),
            row.id,
          );
        });
        this.finish(row.id, ids, "sent");
        this.store.info("PUBLICATION_SENT", "A publication run completed.");
      } catch (error) {
        if (this.stopped) return;
        const status = this.get(row.id).status;
        if (status === "sent" || status === "partial") {
          this.store.incident("STORAGE");
          continue;
        }
        const publishing = status === "publishing";
        const rejected =
          publishing &&
          error instanceof PublicationError &&
          error.outcome === "not_sent" &&
          this.get(row.id).sentIds.length === 0;
        const incidentCode = rejected
          ? "PUBLICATION_REJECTED"
          : publishing
            ? "PUBLICATION_UNCERTAIN"
            : preparing
              ? "PUBLICATION_PREPARATION"
              : "PUBLICATION_DELETE";
        const code = error instanceof ProviderError ? error.code : incidentCode;
        this.store.db.run(
          "UPDATE publication_runs SET status=?,error=? WHERE id=?",
          publishing && !rejected ? "uncertain" : "failed",
          code,
          row.id,
        );
        this.store.incident(incidentCode, "publication:" + row.id);
        if (error instanceof ProviderError && error.code === "TELEGRAM_WAIT")
          this.store.incident(error.code);
        this.onChange();
      }
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
}
