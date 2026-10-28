import { Api, errors, type TelegramClient } from "telegram";
import {
  NotificationError,
  type NotificationRequest,
} from "../../connector.js";
import { abortable } from "../../cancellation.js";
import { telegramLong } from "./ids.js";

const permanentErrors = new Set([
  "PEER_ID_INVALID",
  "USERNAME_INVALID",
  "USERNAME_NOT_OCCUPIED",
  "CHAT_ID_INVALID",
  "CHANNEL_INVALID",
  "CHANNEL_PRIVATE",
  "CHAT_ADMIN_REQUIRED",
  "CHAT_WRITE_FORBIDDEN",
  "CHAT_SEND_PLAIN_FORBIDDEN",
  "USER_BANNED_IN_CHANNEL",
  "USER_IS_BLOCKED",
  "YOU_BLOCKED_USER",
  "INPUT_USER_DEACTIVATED",
  "TOPIC_CLOSED",
  "TOPIC_DELETED",
  "REPLY_TO_INVALID",
  "MESSAGE_TOO_LONG",
  "MESSAGE_EMPTY",
]);
export async function sendTelegramReport(
  client: TelegramClient,
  request: NotificationRequest,
  signal: AbortSignal,
): Promise<void> {
  try {
    const peer = await abortable(
      client.getInputEntity(request.destination.externalId),
      signal,
    );
    const response = await abortable(
      client.invoke(
        new Api.messages.SendMessage({
          peer,
          message: request.text,
          noWebpage: true,
          randomId: telegramLong(request.randomId),
          ...(peer instanceof Api.InputPeerChannel
            ? { sendAs: new Api.InputPeerSelf() }
            : {}),
          ...(request.destination.topicId
            ? {
                replyTo: new Api.InputReplyToMessage({
                  replyToMsgId: Number(request.destination.topicId),
                  topMsgId: Number(request.destination.topicId),
                }),
              }
            : {}),
        }),
      ),
      signal,
    );
    if (response instanceof Api.UpdateShortSentMessage && response.id > 0)
      return;
    if (
      (response instanceof Api.Updates ||
        response instanceof Api.UpdatesCombined) &&
      response.updates.some(
        (update) =>
          update instanceof Api.UpdateMessageID &&
          update.randomId?.toString() === request.randomId &&
          update.id > 0,
      )
    )
      return;
    throw new NotificationError("TELEGRAM_REPORT_UNCERTAIN");
  } catch (error) {
    if (error instanceof NotificationError) throw error;
    if (error instanceof errors.RPCError) {
      if (error.errorMessage === "RANDOM_ID_DUPLICATE")
        throw new NotificationError(
          "TELEGRAM_REPORT_UNCERTAIN",
          false,
          0,
          error,
        );
      if (
        error instanceof errors.FloodWaitError ||
        error instanceof errors.SlowModeWaitError ||
        error instanceof errors.FloodTestPhoneWaitError
      )
        throw new NotificationError(
          "TELEGRAM_WAIT",
          false,
          error.seconds,
          error,
        );
      if (error.code === 401)
        throw new NotificationError("TELEGRAM_AUTH", false, 0, error);
      if (permanentErrors.has(error.errorMessage))
        throw new NotificationError(error.errorMessage, true, 0, error);
    }
    throw new NotificationError("TELEGRAM_REPORT_CONNECTION", false, 0, error);
  }
}
