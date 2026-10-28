import nodemailer from "nodemailer";
import type { Config } from "./config.js";
import type { Match } from "@monitor/shared";
import { Store, now } from "./store.js";
import { matchReport, incidentReport } from "./notification-content.js";
export {
  escapeHtml,
  matchReport as matchEmail,
} from "./notification-content.js";
export interface MailTransport {
  sendMail(mail: Record<string, unknown>): Promise<unknown>;
  close(): void;
}
export class EmailWorker {
  private transport: MailTransport;
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopped = true;
  constructor(
    private config: Config,
    private store: Store,
    transport?: MailTransport,
  ) {
    this.transport =
      transport ||
      nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        requireTLS: !config.smtp.secure,
        auth: config.smtp.user
          ? { user: config.smtp.user, pass: config.smtp.password }
          : undefined,
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      });
  }
  start() {
    this.stopped = false;
    this.timer = setInterval(() => this.wake(), 1000);
    this.wake();
  }
  wake() {
    if (this.stopped || this.active) return;
    this.active = this.pump()
      .catch(() => {
        this.store.incident("STORAGE");
        console.error(
          "Email worker could not update storage. Jobs remain recoverable.",
        );
      })
      .finally(() => {
        this.active = undefined;
      });
  }
  async pump() {
    while (!this.stopped) {
      const job = this.store.db.get(
        "SELECT * FROM notification_jobs WHERE channel='email' AND status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,id LIMIT 1",
        now(),
      );
      if (!job) return;
      const attempts = Number(job.attempts) + 1;
      this.store.db.run(
        "UPDATE notification_jobs SET attempts=? WHERE id=?",
        attempts,
        job.id,
      );
      try {
        let content: { subject: string; text: string; html: string };
        const payload = JSON.parse(job.payload);
        if (job.kind === "match") content = matchReport(payload as Match);
        else {
          const incident = this.store.db.get<{
            occurrences: number;
            last_seen_at: string;
          }>(
            "SELECT occurrences,last_seen_at FROM activity WHERE id=?",
            job.incident_id,
          );
          content = incidentReport(payload, incident);
        }
        await this.transport.sendMail({
          from: this.config.smtp.from,
          to: this.config.smtp.to,
          messageId: `<${job.id}@${this.config.smtp.from.split("@")[1]}>`,
          ...content,
        });
        this.store.db.run(
          "UPDATE notification_jobs SET status='sent',sent_at=?,last_error=NULL,payload='{}' WHERE id=?",
          now(),
          job.id,
        );
        this.store.resolve("SMTP_DELIVERY");
      } catch (error) {
        const failure = smtpFailure(error);
        const failed = job.kind === "match" && failure.permanent;
        const delay = Math.min(3600, 15 * 2 ** Math.min(attempts - 1, 12));
        this.store.db.run(
          "UPDATE notification_jobs SET status=?,next_attempt_at=?,last_error=? WHERE id=?",
          failed ? "failed" : "pending",
          new Date(Date.now() + delay * 1000).toISOString(),
          failure.code,
          job.id,
        );
        // A failed alert remains its own durable error record. Never generate another alert for it.
        if (job.kind === "match") this.store.incident("SMTP_DELIVERY");
      }
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.active;
    this.transport.close();
  }
}
function smtpFailure(error: unknown): { code: string; permanent: boolean } {
  const value = error as { code?: string; responseCode?: number };
  if (value.code === "EAUTH") return { code: "SMTP_AUTH", permanent: true };
  if (
    value.code === "ETLS" ||
    value.code === "CERT_HAS_EXPIRED" ||
    value.code === "DEPTH_ZERO_SELF_SIGNED_CERT"
  )
    return { code: "SMTP_TLS", permanent: false };
  if (value.responseCode && value.responseCode >= 500)
    return { code: "SMTP_REJECTED", permanent: true };
  return { code: "SMTP_CONNECTION", permanent: false };
}
