import type { Match, MatchImage } from "@monitor/shared";
import { ProviderError, type Connector } from "./connector.js";
import { HttpError } from "./http.js";
import { Store, now } from "./store.js";

export const matchImageCacheLimit = 100 * 1024 * 1024;
const validId = (id: string | undefined): id is string =>
  !!id && /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647;
export function matchImageMimeType(data: Uint8Array): string | undefined {
  const buffer = Buffer.from(data);
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  )
    return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  )
    return "image/gif";
}
interface CachedImage {
  data: Buffer;
  mimeType: string;
}
export class MatchImages {
  private lists = new Map<string, Promise<MatchImage[]>>();
  private downloads = new Map<string, Promise<CachedImage>>();
  private cancellation = new AbortController();
  private running = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private store: Store,
    private connector?: Connector,
    private cacheLimit = matchImageCacheLimit,
  ) {}
  private match(id: string): Match {
    const match = this.store.match(id);
    if (!match) throw new HttpError(404, "Match not found.");
    return match;
  }
  private async limited<T>(work: () => Promise<T>): Promise<T> {
    if (this.waiting.length >= 30)
      throw new HttpError(503, "Images are busy. Please retry shortly.");
    if (this.running >= 2)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.running++;
    try {
      if (this.cancellation.signal.aborted)
        throw new HttpError(503, "Image service is stopping.");
      return await work();
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      if (error.code === "MATCH_IMAGE_UNAVAILABLE")
        throw new HttpError(
          404,
          "This image is no longer available in Telegram.",
        );
      if (error.code === "MATCH_IMAGE_TOO_LARGE")
        throw new HttpError(
          413,
          "This image exceeds the preview or 10 MiB zoom limit.",
        );
      throw new HttpError(
        503,
        "Cannot load this image from Telegram right now. Check the connection and retry.",
      );
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
  list(id: string): Promise<MatchImage[]> {
    const pending = this.lists.get(id);
    if (pending) return pending;
    const work = this.loadList(id).finally(() => this.lists.delete(id));
    this.lists.set(id, work);
    return work;
  }
  private async loadList(id: string): Promise<MatchImage[]> {
    const match = this.match(id);
    const images = match.attachments.filter(
      (attachment) => attachment.type === "image",
    );
    if (!images.length) return [];
    const existing = this.store.db.all(
      "SELECT external_item_id FROM match_image_refs WHERE match_id=? ORDER BY ordinal",
      id,
    );
    if (existing.length)
      return existing.map((row) => ({ externalItemId: row.external_item_id }));
    let refs: MatchImage[];
    if (images.every((image) => validId(image.externalItemId)))
      refs = images.map((image) => ({ externalItemId: image.externalItemId! }));
    else {
      if (
        !this.connector?.findMatchImages ||
        this.connector.accountId !== match.accountId
      )
        throw new HttpError(
          503,
          "Image previews are unavailable for this connector.",
        );
      let anchor = match.externalItemId;
      if (!validId(anchor) && match.url) {
        try {
          anchor = new URL(match.url).pathname.split("/").at(-1);
        } catch {
          anchor = undefined;
        }
      }
      refs = await this.limited(() =>
        this.connector!.findMatchImages!(
          {
            externalSourceId: match.externalSourceId,
            identity: match.identity,
            eventTime: match.messageTime,
            ...(validId(anchor) ? { externalItemId: anchor } : {}),
          },
          this.cancellation.signal,
        ),
      );
    }
    const ids = [
      ...new Set(refs.map((ref) => ref.externalItemId).filter(validId)),
    ].slice(0, images.length);
    this.store.db.transaction(() => {
      this.match(id);
      ids.forEach((itemId, ordinal) =>
        this.store.db.run(
          "INSERT INTO match_image_refs VALUES(?,?,?)",
          id,
          itemId,
          ordinal,
        ),
      );
    });
    return ids.map((externalItemId) => ({ externalItemId }));
  }
  get(
    id: string,
    itemId: string,
    variant: "preview" | "full",
  ): Promise<CachedImage> {
    const key = `${id}:${itemId}:${variant}`;
    const pending = this.downloads.get(key);
    if (pending) return pending;
    const work = this.load(id, itemId, variant).finally(() =>
      this.downloads.delete(key),
    );
    this.downloads.set(key, work);
    return work;
  }
  private async load(
    id: string,
    itemId: string,
    variant: "preview" | "full",
  ): Promise<CachedImage> {
    const match = this.match(id);
    if (
      !validId(itemId) ||
      !(await this.list(id)).some((image) => image.externalItemId === itemId)
    )
      throw new HttpError(404, "Image not found in this match.");
    const cached = this.store.db.get(
      "SELECT mime_type,data FROM match_image_cache WHERE match_id=? AND external_item_id=? AND variant=?",
      id,
      itemId,
      variant,
    );
    if (cached) {
      this.store.db.run(
        "UPDATE match_image_cache SET accessed_at=? WHERE match_id=? AND external_item_id=? AND variant=?",
        now(),
        id,
        itemId,
        variant,
      );
      return { mimeType: cached.mime_type, data: Buffer.from(cached.data) };
    }
    if (
      !this.connector?.downloadMatchImage ||
      this.connector.accountId !== match.accountId
    )
      throw new HttpError(
        503,
        "Image previews are unavailable for this connector.",
      );
    return this.limited(async () => {
      const data = Buffer.from(
        await this.connector!.downloadMatchImage!(
          match.externalSourceId,
          itemId,
          variant,
          this.cancellation.signal,
        ),
      );
      if (!data.length) throw new HttpError(404, "Image is unavailable.");
      if (
        data.length > (variant === "preview" ? 1024 * 1024 : 10 * 1024 * 1024)
      )
        throw new HttpError(413, "Image is too large to display.");
      const mimeType = matchImageMimeType(data);
      if (!mimeType)
        throw new HttpError(
          415,
          "This image format cannot be previewed safely.",
        );
      this.store.db.transaction(() => {
        this.match(id);
        this.store.db.run(
          "INSERT INTO match_image_cache VALUES(?,?,?,?,?,?)",
          id,
          itemId,
          variant,
          mimeType,
          data,
          now(),
        );
        let total = Number(
          this.store.db.get(
            "SELECT coalesce(sum(length(data)),0) size FROM match_image_cache",
          )!.size,
        );
        while (total > this.cacheLimit) {
          const oldest = this.store.db.get(
            "SELECT rowid,length(data) size FROM match_image_cache ORDER BY accessed_at,rowid LIMIT 1",
          )!;
          this.store.db.run(
            "DELETE FROM match_image_cache WHERE rowid=?",
            oldest.rowid,
          );
          total -= Number(oldest.size);
        }
      });
      return { mimeType, data };
    });
  }
  async stop() {
    this.cancellation.abort();
    await Promise.allSettled([
      ...this.lists.values(),
      ...this.downloads.values(),
    ]);
  }
}
