import { randomBytes } from "node:crypto";
import type { Match } from "@monitor/shared";
import type {
  TelegramNotificationsConfig,
  TelegramNotificationTarget,
} from "./config.js";
import { NotificationError, type Connector } from "./connector.js";
import { incidentReport, matchReport } from "./notification-content.js";
import { Store, now } from "./store.js";

export function reportParts(
  subject: string,
  text: string,
  id: string,
): string[] {
  const chunks: string[] = [];
  while (text.length) {
    let end = Math.min(3600, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end - 1);
      const space = text.lastIndexOf(" ", end - 1);
      if (newline >= end / 2) end = newline + 1;
      else if (space >= end / 2) end = space + 1;
      else if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
    }
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  return chunks.map(
    (chunk, index) =>
      `${Array.from(subject).slice(0, 150).join("")}\nReport: ${id} · Part ${index + 1}/${chunks.length}\n\n${chunk}`,
  );
}
export class TelegramNotificationWorker {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopped = true;
  private cancellation = new AbortController();
  constructor(
    private config: TelegramNotificationsConfig | undefined,
    private store: Store,
    private connector: Connector,
  ) {}
  start() {
    if (!this.config?.enabled) return;
    this.stopped = false;
    this.cancellation = new AbortController();
    this.timer = setInterval(() => this.wake(), 1000);
    this.wake();
  }
  wake() {
    if (this.stopped || this.active) return;
    this.active = this.pump()
      .catch(() => {
        this.store.incident("STORAGE");
        console.error(
          "Telegram report worker could not update storage. Jobs remain recoverable.",
        );
      })
      .finally(() => {
        this.active = undefined;
      });
  }
  async pump() {
    if (
      this.stopped ||
      !this.store.notificationChannelEnabled("telegram") ||
      !this.connector.sendNotification ||
      this.connector.status().state !== "connected"
    )
      return;
    const state = this.store.db.get(
      "SELECT next_send_at FROM notification_state WHERE channel='telegram'",
    );
    if (state && state.next_send_at > now()) return;
    const job = this.store.db.get(
      "SELECT * FROM notification_jobs WHERE channel='telegram' AND status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,id LIMIT 1",
      now(),
    );
    if (!job) return;
    const attempts = Number(job.attempts) + 1;
    let parts: string[];
    if (job.parts) parts = JSON.parse(job.parts);
    else {
      const payload = JSON.parse(job.payload);
      const incident =
        job.kind === "incident"
          ? this.store.db.get<{ occurrences: number; last_seen_at: string }>(
              "SELECT occurrences,last_seen_at FROM activity WHERE id=?",
              job.incident_id,
            )
          : undefined;
      const report =
        job.kind === "match"
          ? matchReport(payload as Match)
          : incidentReport(payload, incident);
      parts = reportParts(report.subject, report.text, job.id);
    }
    const target: TelegramNotificationTarget = {
      externalId: this.config!.externalId!,
      ...(this.config!.topicId ? { topicId: this.config!.topicId } : {}),
    };
    const randomIds: string[] = job.random_ids
      ? JSON.parse(job.random_ids)
      : parts.map(() => String(randomBytes(8).readBigInt64LE() || 1n));
    this.store.db.transaction(() => {
      this.store.db.run(
        "UPDATE notification_jobs SET attempts=?,parts=?,random_ids=?,destination=? WHERE id=?",
        attempts,
        JSON.stringify(parts),
        JSON.stringify(randomIds),
        JSON.stringify(target),
        job.id,
      );
      this.store.db.run(
        "UPDATE notification_state SET next_send_at=? WHERE channel='telegram'",
        new Date(Date.now() + 1100).toISOString(),
      );
    });
    try {
      await this.connector.sendNotification(
        {
          destination: target,
          text: parts[job.sent_parts]!,
          randomId: randomIds[job.sent_parts]!,
        },
        this.cancellation.signal,
      );
      const complete = Number(job.sent_parts) + 1 === parts.length;
      this.store.db.run(
        "UPDATE notification_jobs SET sent_parts=sent_parts+1,status=?,sent_at=?,last_error=NULL,failures=0,payload=?,parts=? WHERE id=?",
        complete ? "sent" : "pending",
        complete ? now() : null,
        complete ? "{}" : job.payload,
        complete ? null : JSON.stringify(parts),
        job.id,
      );
      this.store.resolve("TELEGRAM_NOTIFICATION_DELIVERY");
    } catch (error) {
      if (this.stopped) return;
      const failure =
        error instanceof NotificationError
          ? error
          : new NotificationError("TELEGRAM_REPORT_CONNECTION");
      const failed = job.kind === "match" && failure.permanent;
      const delay = Math.max(
        failure.retryAfterSeconds || 0,
        Math.min(3600, 15 * 2 ** Math.min(Number(job.failures), 12)),
      );
      const retryAt = new Date(Date.now() + delay * 1000).toISOString();
      this.store.db.transaction(() => {
        this.store.db.run(
          "UPDATE notification_jobs SET status=?,next_attempt_at=?,last_error=?,failures=failures+1 WHERE id=?",
          failed ? "failed" : "pending",
          retryAt,
          failure.code,
          job.id,
        );
        if (failure.retryAfterSeconds)
          this.store.db.run(
            "UPDATE notification_state SET next_send_at=? WHERE channel='telegram'",
            retryAt,
          );
      });
      if (job.kind === "match")
        this.store.incident("TELEGRAM_NOTIFICATION_DELIVERY");
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.cancellation.abort();
    await this.active;
  }
}
