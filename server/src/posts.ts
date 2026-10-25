import { randomUUID } from "node:crypto";
import type { Page, Post, PostImage } from "@monitor/shared";
import { HttpError } from "./http.js";
import { Store, now } from "./store.js";

export const postBodyLimit = 28 * 1024 * 1024;
const activeRuns = "('queued','deleting','publishing','uncertain')";
const retainedRuns = "('queued','deleting','publishing','uncertain','failed')";
export class Posts {
  constructor(private store: Store) {}
  list(page = 1, pageSize = 25): Page<Post> {
    return {
      items: this.store.db
        .all(
          "SELECT id FROM posts ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",
          pageSize,
          (page - 1) * pageSize,
        )
        .map((row) => this.get(row.id)),
      total: Number(this.store.db.get("SELECT count(*) n FROM posts")!.n),
      page,
      pageSize,
    };
  }
  get(id: string): Post {
    const row = this.store.db.get("SELECT * FROM posts WHERE id=?", id);
    if (!row) throw new HttpError(404, "Post not found.");
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      text: row.text,
      images: this.store.db
        .all(
          "SELECT id,name,mime_type,length(data) size FROM post_images WHERE post_id=? AND selected=1 ORDER BY ordinal",
          id,
        )
        .map((image) => ({
          id: image.id,
          name: image.name,
          mimeType: image.mime_type,
          size: image.size,
        })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  image(id: string) {
    const row = this.store.db.get("SELECT * FROM post_images WHERE id=?", id);
    if (!row) throw new HttpError(404, "Image not found.");
    return {
      id: row.id as string,
      name: row.name as string,
      mimeType: row.mime_type as string,
      data: Buffer.from(row.data),
    };
  }
  private requireIdle(id: string) {
    if (
      this.store.db.get(
        `SELECT id FROM publication_runs WHERE post_id=? AND status IN ${activeRuns}`,
        id,
      )
    )
      throw new HttpError(
        409,
        "Resolve queued, running or uncertain publication runs before changing this post.",
      );
  }
  save(input: Record<string, unknown>, id: string = randomUUID()): Post {
    const existing = this.store.db.get("SELECT id FROM posts WHERE id=?", id);
    if (existing) this.requireIdle(id);
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 120
    )
      throw new HttpError(400, "Post name must contain 1–120 characters.");
    if (
      typeof input.text !== "string" ||
      !Array.isArray(input.images) ||
      input.images.length > 10
    )
      throw new HttpError(400, "Provide plain text and at most ten images.");
    if (
      input.text.length > (input.images.length ? 1024 : 4096) ||
      (!input.text.trim() && !input.images.length)
    )
      throw new HttpError(
        400,
        "Provide text or images. Text allows 4096 characters, or 1024 with images.",
      );
    const images = input.images.map((value: unknown) => {
      if (!value || typeof value !== "object")
        throw new HttpError(400, "Invalid image.");
      const image = value as Record<string, unknown>;
      if (typeof image.id === "string") {
        if (
          !this.store.db.get(
            "SELECT id FROM post_images WHERE id=? AND post_id=?",
            image.id,
            id,
          )
        )
          throw new HttpError(400, "Image does not belong to this post.");
        return this.image(image.id);
      }
      return validateImage(image);
    });
    if (new Set(images.map((image) => image.id)).size !== images.length)
      throw new HttpError(400, "Images cannot be repeated.");
    if (
      images.reduce((total, image) => total + image.data.length, 0) >
      20 * 1024 * 1024
    )
      throw new HttpError(413, "A post allows at most 20 MiB of images.");
    this.store.db.transaction(() => {
      const time = now();
      this.store.db.run(
        "INSERT INTO posts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,text=excluded.text,updated_at=excluded.updated_at",
        id,
        "owner",
        input.name!.toString().trim(),
        input.text as string,
        time,
        time,
      );
      this.store.db.run(
        "UPDATE post_images SET selected=0 WHERE post_id=?",
        id,
      );
      images.forEach((image, index) =>
        this.store.db.run(
          "INSERT INTO post_images(id,post_id,ordinal,mime_type,name,data,selected) VALUES(?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,selected=1",
          image.id,
          id,
          index,
          image.mimeType,
          image.name,
          image.data,
        ),
      );
      this.pruneImages(id);
    });
    return this.get(id);
  }
  pruneImages(postId: string) {
    this.store.db.run(
      `DELETE FROM post_images WHERE post_id=? AND selected=0 AND id NOT IN (SELECT json_extract(image.value,'$.id') FROM publication_runs run,json_each(run.snapshot,'$.images') image WHERE run.post_id=? AND run.status IN ${retainedRuns})`,
      postId,
      postId,
    );
  }
  remove(id: string) {
    this.get(id);
    this.requireIdle(id);
    if (
      this.store.db.get("SELECT id FROM schedules WHERE post_id=?", id) ||
      this.store.db.get("SELECT id FROM publication_runs WHERE post_id=?", id)
    )
      throw new HttpError(
        409,
        "Posts used by schedules or publication history cannot be deleted.",
      );
    this.store.db.run("DELETE FROM posts WHERE id=?", id);
  }
}
function validateImage(
  image: Record<string, unknown>,
): PostImage & { data: Buffer } {
  if (
    typeof image.base64 !== "string" ||
    image.base64.length > 7 * 1024 * 1024 ||
    image.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)
  )
    throw new HttpError(400, "Provide a base64 JPEG or PNG image up to 5 MiB.");
  const data = Buffer.from(image.base64, "base64");
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new HttpError(413, "Each image allows at most 5 MiB.");
  const png =
    data.length >= 33 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.toString("ascii", 12, 16) === "IHDR" &&
    data.subarray(-8, -4).toString("ascii") === "IEND";
  const jpeg =
    data.length >= 4 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data.at(-2) === 255 &&
    data.at(-1) === 217;
  const mimeType = png ? "image/png" : jpeg ? "image/jpeg" : undefined;
  if (!mimeType || image.mimeType !== mimeType)
    throw new HttpError(400, "Image content must match its JPEG or PNG type.");
  const dimensions = png
    ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    : jpegDimensions(data);
  if (
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > 10000 ||
    dimensions.height > 10000 ||
    dimensions.width * dimensions.height > 40000000
  )
    throw new HttpError(
      400,
      "Use valid images up to 10000 pixels per side and 40 megapixels.",
    );
  return {
    id: randomUUID(),
    name: `image.${png ? "png" : "jpg"}`,
    mimeType,
    size: data.length,
    data,
  };
}
function jpegDimensions(
  data: Buffer,
): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 255) return;
    while (data[offset] === 255) offset++;
    const marker = data[offset++];
    if (marker === undefined || marker === 218 || marker === 217) return;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > data.length) return;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return;
    if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      if (length < 8) return;
      return {
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
}
