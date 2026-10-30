import { postHeading } from "@monitor/shared";
import { randomUUID } from "node:crypto";
import type { Page, Schedule } from "@monitor/shared";
import { nextOccurrence, validateCalendar } from "./calendar.js";
import { HttpError } from "./http.js";
import { Publications } from "./publications.js";
import { Store, now } from "./store.js";

export class Schedules {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private store: Store,
    private publications: Publications,
  ) {}
  private map(row: Record<string, any>): Schedule {
    const blocked = this.store.db.get(
      "SELECT id FROM publication_runs WHERE schedule_id=? AND status IN ('queued','deleting','publishing','uncertain','failed')",
      row.id,
    );
    return {
      id: row.id,
      ownerId: row.owner_id,
      accountId: row.account_id,
      postId: row.post_id,
      postHeading: postHeading(this.publications.posts.get(row.post_id)),
      destination: JSON.parse(row.destination),
      calendar: JSON.parse(row.calendar),
      paused: !!row.paused,
      nextRunAt: row.next_run_at,
      previousDestination: row.previous_destination
        ? JSON.parse(row.previous_destination)
        : undefined,
      previousIds: JSON.parse(row.previous_ids),
      createdAt: row.created_at,
      blockedRunId: blocked?.id,
    };
  }
  get(id: string): Schedule {
    const row = this.store.db.get(
      "SELECT * FROM schedules WHERE id=? AND deleted_at IS NULL",
      id,
    );
    if (!row) throw new HttpError(404, "Schedule not found.");
    return this.map(row);
  }
  list(page = 1, pageSize = 25): Page<Schedule> {
    return {
      items: this.store.db
        .all(
          "SELECT * FROM schedules WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
          pageSize,
          (page - 1) * pageSize,
        )
        .map((row) => this.map(row)),
      total: Number(
        this.store.db.get(
          "SELECT count(*) n FROM schedules WHERE deleted_at IS NULL",
        )!.n,
      ),
      page,
      pageSize,
    };
  }
  create(input: Record<string, unknown>): Schedule {
    if (typeof input.postId !== "string")
      throw new HttpError(400, "Choose a post.");
    this.publications.posts.get(input.postId);
    const destination = this.publications.destination(input.sourceId);
    const calendar = validateCalendar(input.calendar);
    const id = randomUUID();
    this.store.db.run(
      "INSERT INTO schedules(id,owner_id,post_id,destination,calendar,next_run_at,created_at) VALUES(?,?,?,?,?,?,?)",
      id,
      "owner",
      input.postId,
      JSON.stringify(destination),
      JSON.stringify(calendar),
      nextOccurrence(calendar, new Date()),
      now(),
    );
    return this.get(id);
  }
  update(id: string, input: Record<string, unknown>): Schedule {
    return this.store.db.transaction(() => {
      const schedule = this.get(id);
      this.requireEditable(id);
      if (typeof input.postId !== "string")
        throw new HttpError(400, "Choose a post.");
      this.publications.posts.get(input.postId);
      const destination =
        input.sourceId === undefined
          ? schedule.destination
          : this.publications.destination(input.sourceId);
      const calendar = validateCalendar(input.calendar);
      const changed =
        JSON.stringify(calendar) !==
        JSON.stringify(validateCalendar(schedule.calendar));
      const lastPublication =
        changed && calendar.frequency === "hourly"
          ? this.store.db.get(
              "SELECT last_published_at FROM schedules WHERE id=?",
              id,
            )
          : undefined;
      this.store.db.run(
        "UPDATE schedules SET post_id=?,destination=?,calendar=?,next_run_at=? WHERE id=?",
        input.postId,
        JSON.stringify(destination),
        JSON.stringify(calendar),
        changed
          ? nextOccurrence(
              calendar,
              lastPublication?.last_published_at
                ? new Date(lastPublication.last_published_at)
                : new Date(),
            )
          : schedule.nextRunAt,
        id,
      );
      return this.get(id);
    });
  }
  remove(id: string) {
    this.store.db.transaction(() => {
      this.get(id);
      this.requireEditable(id);
      this.store.db.run(
        "UPDATE schedules SET deleted_at=?,paused=1 WHERE id=?",
        now(),
        id,
      );
    });
  }
  private requireEditable(id: string) {
    if (this.hasUnfinished(id))
      throw new HttpError(
        409,
        "This schedule has an unfinished run. Check publication history to cancel, retry or review it.",
      );
  }
  pause(id: string, paused: unknown) {
    this.get(id);
    if (typeof paused !== "boolean")
      throw new HttpError(400, "paused must be boolean.");
    this.store.db.run(
      "UPDATE schedules SET paused=? WHERE id=?",
      Number(paused),
      id,
    );
    if (!paused) this.tick();
    return this.get(id);
  }
  private hasUnfinished(id: string) {
    return !!this.store.db.get(
      "SELECT id FROM publication_runs WHERE schedule_id=? AND status IN ('queued','deleting','publishing','uncertain','failed')",
      id,
    );
  }
  runNow(id: string) {
    const run = this.store.db.transaction(() => {
      const schedule = this.get(id);
      if (this.hasUnfinished(id))
        throw new HttpError(
          409,
          "This schedule has an unfinished run. Check publication history.",
        );
      return this.publications.queue(
        schedule.postId,
        schedule.destination,
        id,
        schedule.previousIds,
        "manual",
        schedule.previousDestination,
      );
    });
    this.publications.wake();
    return run;
  }
  tick() {
    if (!this.publications.connected()) return;
    try {
      for (const row of this.store.db.all(
        "SELECT * FROM schedules WHERE deleted_at IS NULL AND paused=0 AND next_run_at<=? ORDER BY next_run_at,id",
        now(),
      )) {
        if (this.hasUnfinished(row.id)) continue;
        this.store.db.transaction(() => {
          const schedule = this.get(row.id);
          this.publications.queue(
            schedule.postId,
            schedule.destination,
            schedule.id,
            schedule.previousIds,
            "scheduled",
            schedule.previousDestination,
          );
          this.store.db.run(
            "UPDATE schedules SET next_run_at=? WHERE id=?",
            nextOccurrence(schedule.calendar, new Date()),
            schedule.id,
          );
        });
      }
      this.publications.wake();
    } catch {
      this.store.incident("SCHEDULING");
    }
  }
  start() {
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
