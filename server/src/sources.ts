import type { DiscoveredSource } from "@monitor/shared";
import type { Connector } from "./connector.js";
import { HttpError } from "./http.js";
import { Store } from "./store.js";
import { Serial } from "./serial.js";
export class Sources {
  private discovered: DiscoveredSource[] = [];
  constructor(
    private store: Store,
    private connector: Connector,
    public serial: Serial,
  ) {}
  discovery() {
    return this.discovered;
  }
  async refresh() {
    this.discovered = await this.connector.listSources();
    for (const selected of this.store.sources()) {
      const fresh = this.discovered.find(
        (s) =>
          s.externalId === selected.externalId &&
          (s.topicId || "") === (selected.topicId || ""),
      );
      if (fresh)
        this.store.db.run(
          "UPDATE sources SET name=?,url=?,kind=? WHERE id=?",
          fresh.name,
          fresh.url || null,
          fresh.kind,
          selected.id,
        );
    }
    this.store.info(
      "SOURCE_REFRESH",
      "Accessible source discovery was refreshed.",
    );
    return this.discovered;
  }
  async select(externalId: unknown, topicId: unknown) {
    if (
      typeof externalId !== "string" ||
      (topicId !== undefined && typeof topicId !== "string")
    )
      throw new HttpError(400, "Choose a discovered source.");
    const source = this.discovered.find(
      (s) =>
        s.externalId === externalId && (s.topicId || "") === (topicId || ""),
    );
    if (!source)
      throw new HttpError(
        400,
        "Refresh discovery and select an accessible source.",
      );
    return this.serial.run(externalId, async () => {
      if (
        this.store
          .sources()
          .some(
            (s) =>
              s.externalId === externalId &&
              (s.topicId || "") === (topicId || ""),
          )
      )
        throw new HttpError(409, "This source is already selected.");
      const position = await this.connector.currentPosition(externalId);
      return this.store.addSource(source, position);
    });
  }
  async enable(id: string, enabled: unknown) {
    if (typeof enabled !== "boolean")
      throw new HttpError(400, "enabled must be boolean.");
    const source = this.store.source(id);
    if (!source) throw new HttpError(404, "Source not found.");
    return this.serial.run(source.externalId, async () => {
      const current = this.store.source(id);
      if (!current) throw new HttpError(404, "Source not found.");
      if (current.enabled !== enabled)
        this.store.setSourceEnabled(
          id,
          enabled,
          enabled
            ? await this.connector.currentPosition(current.externalId)
            : undefined,
        );
      if (
        !this.store
          .sources()
          .some((s) => s.externalId === source.externalId && s.enabled)
      ) {
        this.store.db.run(
          "DELETE FROM albums WHERE external_id=?",
          source.externalId,
        );
        this.store.db.run(
          "DELETE FROM recovery_items WHERE external_id=?",
          source.externalId,
        );
      }
      return this.store.source(id);
    });
  }
  async remove(id: string) {
    const source = this.store.source(id);
    if (!source) throw new HttpError(404, "Source not found.");
    await this.serial.run(source.externalId, async () => {
      this.store.removeSource(id);
      if (
        !this.store
          .sources()
          .some((s) => s.externalId === source.externalId && s.enabled)
      ) {
        this.store.db.run(
          "DELETE FROM albums WHERE account_id=? AND external_id=?",
          source.accountId,
          source.externalId,
        );
        this.store.db.run(
          "DELETE FROM recovery_items WHERE external_id=?",
          source.externalId,
        );
      }
    });
  }
}
