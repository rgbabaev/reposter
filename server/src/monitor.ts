import { setImmediate as yieldToWorkers } from "node:timers/promises";
import type { IncomingItem, Source, Rule } from "@monitor/shared";
import { ProviderError, type Connector } from "./connector.js";
import { Store } from "./store.js";
import { Serial } from "./serial.js";
import { Albums } from "./albums.js";
import { matchesRule } from "./rules.js";
export class Monitor {
  private timer?: ReturnType<typeof setInterval>;
  private running = new Set<string>();
  private active = new Set<Promise<void>>();
  private due = new Map<string, number>();
  private stopped = true;
  private albums: Albums;
  constructor(
    private store: Store,
    private connector: Connector,
    private serial: Serial,
    private onCommit: () => void = () => {},
  ) {
    this.albums = new Albums(store);
  }
  start() {
    this.stopped = false;
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }
  signal(externalId: string) {
    this.due.set(externalId, 0);
    this.tick();
  }
  private tick() {
    if (this.stopped || this.connector.status().state !== "connected") return;
    for (const id of new Set(
      this.store
        .sources()
        .filter((s) => s.enabled)
        .map((s) => s.externalId),
    ))
      if (
        this.running.size < 3 &&
        !this.running.has(id) &&
        (this.due.get(id) || 0) <= Date.now()
      ) {
        this.running.add(id);
        this.due.set(id, Date.now() + 15000);
        const work = this.serial
          .run(id, () => this.catchUp(id))
          .catch((error) => {
            if (this.stopped) return;
            const code =
              error instanceof ProviderError ? error.code : "MONITORING";
            this.store.incident(code, code + ":" + id);
            this.store.sourceError(id, code);
          })
          .finally(() => {
            this.running.delete(id);
            this.active.delete(work);
            if (!this.due.get(id)) this.due.set(id, Date.now() + 15000);
          });
        this.active.add(work);
      }
  }
  async catchUp(externalId: string) {
    if (this.stopped && this.timer) return;
    const sources = this.store
      .sources()
      .filter((s) => s.enabled && s.externalId === externalId);
    if (!sources.length) return;
    const after = sources.reduce(
      (a, s) => (BigInt(s.position) < BigInt(a) ? s.position : a),
      sources[0]!.position,
    );
    // Durable temporary buffer makes complete album aggregation possible across history pages/restarts.
    const buffered = this.store.db.get(
      "SELECT max(position) position FROM recovery_items WHERE external_id=?",
      externalId,
    )?.position;
    const fetchAfter =
      buffered && BigInt(buffered) > BigInt(after) ? String(buffered) : after;
    for await (const item of this.connector.recover(externalId, fetchAfter)) {
      if (this.stopped && this.timer) return;
      this.store.db.transaction(() => {
        this.store.db.run(
          "INSERT OR IGNORE INTO recovery_items VALUES(?,?,?,?,?)",
          item.accountId,
          externalId,
          item.externalItemId,
          Number(item.position),
          JSON.stringify(item),
        );
        if (item.albumId) this.albums.stage(item);
      });
    }
    if (this.stopped && this.timer) return;
    this.store.sourceError(externalId, null);
    for (const code of [
      "TELEGRAM_ACCESS",
      "TELEGRAM_CONNECTION",
      "TELEGRAM_HISTORY",
      "TELEGRAM_WAIT",
      "MONITORING",
    ])
      this.store.resolve(code + ":" + externalId);
    this.store.db.run(
      "DELETE FROM recovery_items WHERE external_id=? AND position<=?",
      externalId,
      Number(after),
    );
    for (const row of this.store.db.all(
      "SELECT album_id,payload FROM albums WHERE external_id=?",
      externalId,
    )) {
      const parts = JSON.parse(row.payload) as IncomingItem[];
      if (parts.every((part) => BigInt(part.position) <= BigInt(after)))
        this.store.db.run(
          "DELETE FROM albums WHERE external_id=? AND album_id=?",
          externalId,
          row.album_id,
        );
    }
    let processed = 0;
    while (true) {
      if (this.stopped && this.timer) return;
      if (++processed % 100 === 0) await yieldToWorkers();
      const first = this.store.db.get(
        "SELECT * FROM recovery_items WHERE external_id=? ORDER BY position LIMIT 1",
        externalId,
      );
      if (!first) break;
      let boundary = String(first.position);
      const plans: {
        item: IncomingItem;
        sources: Source[];
        matching: Rule[];
      }[] = [];
      const seen = new Set<string>();
      let blocked = false;
      // Extend a transaction to include interleaved items before an album's final member.
      let readThrough = Number(first.position) - 1;
      while (readThrough < Number(boundary)) {
        const rows = this.store.db.all(
          "SELECT * FROM recovery_items WHERE external_id=? AND position>? AND position<=? ORDER BY position LIMIT 100",
          externalId,
          readThrough,
          Number(boundary),
        );
        if (!rows.length) break;
        for (const row of rows) {
          readThrough = row.position;
          const raw = JSON.parse(row.payload) as IncomingItem;
          if (seen.has(raw.identity)) continue;
          seen.add(raw.identity);
          const item = raw.albumId
            ? this.albums.collect(raw.accountId, externalId, raw.albumId)
            : raw;
          if (!item) {
            blocked = true;
            break;
          }
          if (BigInt(item.position) > BigInt(boundary))
            boundary = item.position;
          const current = this.store
            .sources()
            .filter(
              (s) =>
                s.enabled &&
                s.accountId === item.accountId &&
                s.externalId === externalId,
            );
          const eligible = current.filter(
            (s) =>
              BigInt(item.startPosition || item.position) >
                BigInt(s.position) &&
              (!s.topicId || s.topicId === item.topicId),
          );
          const rules = this.store
            .rules()
            .filter(
              (r) =>
                eligible.some(
                  (s) => s.ownerId === r.ownerId && r.sourceIds.includes(s.id),
                ) && matchesRule(r, item),
            );
          plans.push({ item, sources: current, matching: rules });
        }
        if (blocked) break;
      }
      if (blocked) {
        this.due.set(externalId, Date.now() + 1000);
        return;
      }
      this.store.commitBatch(plans, externalId, boundary);
      this.onCommit();
    }
    this.due.set(externalId, Date.now() + 15000);
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.serial.drain();
    await Promise.allSettled(this.active);
  }
}
