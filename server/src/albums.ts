import type { IncomingItem } from "@monitor/shared";
import { Store } from "./store.js";
/** Durable, bounded 2-second collection. Ordered processing blocks on the first unfinished album. */
export class Albums {
  constructor(
    private store: Store,
    private delay = 2000,
  ) {}
  stage(item: IncomingItem) {
    if (!item.albumId) return;
    const row = this.store.db.get(
      "SELECT payload FROM albums WHERE account_id=? AND external_id=? AND album_id=?",
      item.accountId,
      item.externalSourceId,
      item.albumId,
    );
    const parts: IncomingItem[] = row ? JSON.parse(row.payload) : [];
    const index = parts.findIndex(
      (part) => part.externalItemId === item.externalItemId,
    );
    if (index >= 0) parts[index] = item;
    else parts.push(item);
    this.store.db.run(
      "INSERT INTO albums VALUES(?,?,?,?,?) ON CONFLICT(account_id,external_id,album_id) DO UPDATE SET payload=excluded.payload",
      item.accountId,
      item.externalSourceId,
      item.albumId,
      JSON.stringify(parts),
      new Date(Date.now() + this.delay).toISOString(),
    );
  }
  pending(externalId: string): IncomingItem[] {
    return this.store.db
      .all("SELECT payload FROM albums WHERE external_id=?", externalId)
      .flatMap((r) => JSON.parse(r.payload) as IncomingItem[]);
  }
  collect(
    accountId: string,
    externalId: string,
    albumId: string,
  ): IncomingItem | undefined {
    const row = this.store.db.get(
      "SELECT * FROM albums WHERE account_id=? AND external_id=? AND album_id=?",
      accountId,
      externalId,
      albumId,
    );
    if (!row || row.ready_at > new Date().toISOString()) return;
    const parts = (JSON.parse(row.payload) as IncomingItem[]).sort((a, b) =>
      BigInt(a.position) < BigInt(b.position) ? -1 : 1,
    );
    const first = parts[0],
      last = parts[parts.length - 1];
    if (!first || !last) return;
    return {
      ...first,
      identity: "album:" + albumId,
      startPosition: first.position,
      externalItemId: last.externalItemId,
      position: last.position,
      text: parts
        .map((p) => p.text)
        .filter(Boolean)
        .join("\n"),
      attachments: parts.flatMap((p) => p.attachments),
      sender: parts.find((p) => p.sender)?.sender,
    };
  }
}
