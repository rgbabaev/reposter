import { Api, TelegramClient, errors } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { readBigIntFromBuffer } from "telegram/Helpers.js";
import type { PublicationRequest } from "../../connector.js";
import { PublicationError, ProviderError } from "../../connector.js";
import { abortable } from "../../cancellation.js";

const long = (value: string) => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return readBigIntFromBuffer(buffer, true, true);
};
export async function publishTelegram(
  client: TelegramClient,
  request: PublicationRequest,
  signal: AbortSignal,
  recordIds: (ids: string[]) => void,
): Promise<string[]> {
  let sending = false;
  try {
    const peer = await abortable(
      client.getInputEntity(request.destination.externalId),
      signal,
    );
    const sendAs =
      peer instanceof Api.InputPeerChannel
        ? new Api.InputPeerSelf()
        : undefined;
    const replyTo = request.destination.topicId
      ? new Api.InputReplyToMessage({
          replyToMsgId: Number(request.destination.topicId),
          topMsgId: Number(request.destination.topicId),
        })
      : undefined;
    const media: Api.InputSingleMedia[] = [];
    for (const [index, image] of request.images.entries()) {
      const file = await abortable(
        client.uploadFile({
          file: new CustomFile(
            image.name,
            image.data.length,
            "",
            Buffer.from(image.data),
          ),
          workers: 1,
        }),
        signal,
      );
      const uploaded = await abortable(
        client.invoke(
          new Api.messages.UploadMedia({
            peer,
            media: new Api.InputMediaUploadedPhoto({ file }),
          }),
        ),
        signal,
      );
      if (
        !(uploaded instanceof Api.MessageMediaPhoto) ||
        !(uploaded.photo instanceof Api.Photo)
      )
        throw new ProviderError("PUBLICATION_UPLOAD");
      media.push(
        new Api.InputSingleMedia({
          media: new Api.InputMediaPhoto({
            id: new Api.InputPhoto({
              id: uploaded.photo.id,
              accessHash: uploaded.photo.accessHash,
              fileReference: uploaded.photo.fileReference,
            }),
          }),
          randomId: long(request.randomIds[index]!),
          message: index === 0 ? request.text : "",
        }),
      );
    }
    signal.throwIfAborted();
    sending = true;
    const response = await abortable(
      client.invoke(
        media.length > 1
          ? new Api.messages.SendMultiMedia({
              peer,
              replyTo,
              multiMedia: media,
              sendAs,
            })
          : media.length === 1
            ? new Api.messages.SendMedia({
                peer,
                replyTo,
                media: media[0]!.media,
                message: request.text,
                randomId: long(request.randomIds[0]!),
                sendAs,
              })
            : new Api.messages.SendMessage({
                peer,
                replyTo,
                message: request.text,
                noWebpage: true,
                randomId: long(request.randomIds[0]!),
                sendAs,
              }),
      ),
      signal,
    );
    let ids: string[] = [];
    if (response instanceof Api.UpdateShortSentMessage)
      ids = [String(response.id)];
    else if (
      response instanceof Api.Updates ||
      response instanceof Api.UpdatesCombined
    ) {
      const mapping = new Map(
        response.updates
          .filter(
            (update): update is Api.UpdateMessageID =>
              update instanceof Api.UpdateMessageID,
          )
          .map((update) => [
            update.randomId?.toString() || "",
            String(update.id),
          ]),
      );
      ids = request.randomIds.flatMap((id) =>
        mapping.get(id) ? [mapping.get(id)!] : [],
      );
    }
    if (ids.length) recordIds(ids);
    if (ids.length !== request.randomIds.length)
      throw new ProviderError("PUBLICATION_UNCERTAIN");
    return ids;
  } catch (error) {
    const rejected =
      error instanceof errors.RPCError &&
      error.errorMessage !== "RANDOM_ID_DUPLICATE" &&
      [400, 401, 403, 406, 420].includes(error.code || 0);
    throw new PublicationError(
      publicationErrorCode(error, sending, rejected),
      !sending || rejected ? "not_sent" : "uncertain",
      error,
    );
  }
}
export async function verifyTelegramPublication(
  client: TelegramClient,
  request: PublicationRequest,
  ids: string[],
  since: string,
  signal: AbortSignal,
) {
  const messages = await abortable(
    client.getMessages(request.destination.externalId, {
      ids: ids.map(Number),
    }),
    signal,
  );
  const foundIds = new Set(messages.map((message) => String(message.id)));
  if (messages.length !== ids.length || ids.some((id) => !foundIds.has(id)))
    throw new ProviderError("PUBLICATION_REVIEW");
  let album: string | undefined;
  for (const message of messages) {
    const reply = message.replyTo;
    const topic =
      reply instanceof Api.MessageReplyHeader && reply.forumTopic
        ? String(reply.replyToTopId || reply.replyToMsgId || 1)
        : "1";
    if (
      !message.out ||
      !ids.includes(String(message.id)) ||
      message.date * 1000 < Date.parse(since) - 60000 ||
      (request.destination.topicId && topic !== request.destination.topicId) ||
      (request.images.length > 0 && !message.photo) ||
      (message.message !== request.text &&
        !(request.images.length > 1 && !message.message))
    )
      throw new ProviderError("PUBLICATION_REVIEW");
    if (request.images.length > 1) {
      const group = message.groupedId?.toString();
      if (!group || (album && group !== album))
        throw new ProviderError("PUBLICATION_REVIEW");
      album = group;
    }
  }
  if (
    ids.length === request.randomIds.length &&
    !messages.some((message) => message.message === request.text)
  )
    throw new ProviderError("PUBLICATION_REVIEW");
}

const publicationRpcCodes = new Set([
  "SEND_AS_PEER_INVALID",
  "PEER_ID_INVALID",
  "CHANNEL_INVALID",
  "CHANNEL_PRIVATE",
  "CHAT_ADMIN_REQUIRED",
  "CHAT_WRITE_FORBIDDEN",
  "CHAT_SEND_MEDIA_FORBIDDEN",
  "CHAT_SEND_PHOTOS_FORBIDDEN",
  "USER_BANNED_IN_CHANNEL",
  "USER_IS_BLOCKED",
  "PHOTO_INVALID",
  "PHOTO_INVALID_DIMENSIONS",
  "PHOTO_EXT_INVALID",
  "PHOTO_SAVE_FILE_INVALID",
  "MEDIA_INVALID",
  "MEDIA_EMPTY",
  "MEDIA_CAPTION_TOO_LONG",
  "MULTI_MEDIA_TOO_LONG",
  "MESSAGE_EMPTY",
  "MESSAGE_TOO_LONG",
  "RANDOM_ID_DUPLICATE",
  "RANDOM_ID_EMPTY",
  "REPLY_TO_INVALID",
  "REPLY_MESSAGE_ID_INVALID",
  "TOPIC_CLOSED",
  "TOPIC_DELETED",
  "FILE_REFERENCE_EXPIRED",
  "FILE_REFERENCE_INVALID",
  "FILE_PARTS_INVALID",
]);
function publicationErrorCode(
  error: unknown,
  sending: boolean,
  rejected: boolean,
): string {
  if (error instanceof ProviderError) return error.code;
  if (error instanceof errors.RPCError) {
    if (publicationRpcCodes.has(error.errorMessage)) return error.errorMessage;
    if (/^FILE_REFERENCE_\d+_(EXPIRED|INVALID|EMPTY)$/.test(error.errorMessage))
      return "FILE_REFERENCE_INVALID";
    if (error.code === 420) return "TELEGRAM_WAIT";
  }
  return !sending
    ? "PUBLICATION_PREPARATION"
    : rejected
      ? "PUBLICATION_REJECTED"
      : "PUBLICATION_UNCERTAIN";
}
