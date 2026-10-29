import { Api, type TelegramClient } from "telegram";
import type { MatchImageRequest } from "../../connector.js";
import { ProviderError } from "../../connector.js";
import { abortable } from "../../cancellation.js";

function hasImage(message: Api.Message): boolean {
  return !!message.photo || !!message.document?.mimeType.startsWith("image/");
}
export async function findTelegramMatchImages(
  client: TelegramClient,
  request: MatchImageRequest,
  signal: AbortSignal,
) {
  const single = /^message:(\d+)$/.exec(request.identity);
  if (single) return [{ externalItemId: single[1]! }];
  const album = /^album:(\d+)$/.exec(request.identity)?.[1];
  if (!album) return [];
  const messages = await abortable(
    client.getMessages(
      request.externalSourceId,
      request.externalItemId
        ? {
            offsetId: Number(request.externalItemId) + 1,
            addOffset: -25,
            limit: 100,
          }
        : {
            offsetDate: Math.floor(Date.parse(request.eventTime) / 1000) + 1,
            limit: 100,
          },
    ),
    signal,
  );
  return messages
    .filter(
      (message) =>
        message instanceof Api.Message &&
        message.groupedId?.toString() === album &&
        hasImage(message),
    )
    .sort((a, b) => a.id - b.id)
    .map((message) => ({ externalItemId: String(message.id) }));
}
function photoBytes(size: Api.TypePhotoSize): number {
  if (size instanceof Api.PhotoSize) return size.size;
  if (size instanceof Api.PhotoSizeProgressive)
    return Math.max(0, ...size.sizes);
  if (size instanceof Api.PhotoCachedSize) return size.bytes.length;
  return Infinity;
}
export async function downloadTelegramMatchImage(
  client: TelegramClient,
  externalSourceId: string,
  externalItemId: string,
  variant: "preview" | "full",
  signal: AbortSignal,
): Promise<Uint8Array> {
  const messages = await abortable(
    client.getMessages(externalSourceId, { ids: [Number(externalItemId)] }),
    signal,
  );
  const message = messages.find(
    (item) => item instanceof Api.Message && String(item.id) === externalItemId,
  );
  if (!message || !hasImage(message))
    throw new ProviderError("MATCH_IMAGE_UNAVAILABLE");
  const limit = variant === "preview" ? 1024 * 1024 : 10 * 1024 * 1024;
  const photo = message.photo instanceof Api.Photo ? message.photo : undefined;
  const document = message.document;
  const sizes = (photo?.sizes ?? document?.thumbs ?? []).filter((size) =>
    Number.isFinite(photoBytes(size)),
  );
  let thumb: Api.TypePhotoSize | undefined;
  if (photo || variant === "preview") {
    const ordered = [...sizes].sort(
      (a, b) => ("w" in a ? a.w : 0) - ("w" in b ? b.w : 0),
    );
    thumb =
      variant === "preview"
        ? ordered.find(
            (size) => "w" in size && size.w >= 320 && photoBytes(size) <= limit,
          )
        : ordered.at(-1);
    thumb ??= ordered.filter((size) => photoBytes(size) <= limit).at(-1);
    if (photo && !thumb) throw new ProviderError("MATCH_IMAGE_UNAVAILABLE");
    if (thumb && photoBytes(thumb) > limit)
      throw new ProviderError("MATCH_IMAGE_TOO_LARGE");
  }
  if (!thumb && document && Number(document.size) > limit)
    throw new ProviderError("MATCH_IMAGE_TOO_LARGE");
  const progressCallback = async (received: { toString(): string }) => {
    signal.throwIfAborted();
    if (Number(received.toString()) > limit)
      throw new ProviderError("MATCH_IMAGE_TOO_LARGE");
  };
  const downloadSize =
    thumb instanceof Api.PhotoSizeProgressive
      ? new Api.PhotoSize({
          type: thumb.type,
          w: thumb.w,
          h: thumb.h,
          size: photoBytes(thumb),
        })
      : thumb;
  const data = await abortable(
    client.downloadMedia(message, {
      ...(downloadSize ? { thumb: downloadSize } : {}),
      progressCallback,
    }),
    signal,
  );
  if (!Buffer.isBuffer(data) || !data.length)
    throw new ProviderError("MATCH_IMAGE_UNAVAILABLE");
  if (data.length > limit) throw new ProviderError("MATCH_IMAGE_TOO_LARGE");
  return data;
}
