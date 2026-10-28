import { sendTelegramReport } from "./notifications.js";
import { NewMessage } from "telegram/events/NewMessage.js";
import type { Attachment, Sender } from "@monitor/shared";
import { TelegramClient, Api, utils } from "telegram";
import { ProviderError, type Connector } from "../../connector.js";
import type { Config } from "../../config.js";
import type {
  ConnectorStatus,
  DiscoveredSource,
  IncomingItem,
} from "@monitor/shared";
import { makeClient } from "./session.js";
import { history } from "./history.js";
import { abortable, abortableItems } from "../../cancellation.js";
import { NotificationError, type NotificationRequest, PublicationError, type PublicationRequest } from "../../connector.js";
import type { PublicationDestination } from "@monitor/shared";
import { publishTelegram, verifyTelegramPublication } from "./publication.js";
export class TelegramConnector implements Connector {
  readonly accountId = "telegram";
  protected client?: TelegramClient;
  private state: ConnectorStatus["state"] = "disconnected";
  private retryAt = 0;
  private failures = 0;
  private timer?: ReturnType<typeof setInterval>;
  private connecting = false;
  private stopped = false;
  private cancellation = new AbortController();
  private onConnected: () => void = () => {};
  protected signal: (id: string) => void = () => {};
  protected report: (code: string) => void = () => {};
  constructor(protected config: Config) {}
  status(): ConnectorStatus {
    return {
      accountId: this.accountId,
      state:
        this.state === "connected" && !this.client?.connected
          ? "disconnected"
          : this.state,
      capabilities: {
        history: true,
        topics: true,
        attachmentMetadata: true,
        publication: true,
        deletion: true,
      },
      instruction:
        "Run MONITOR_CONFIG=/absolute/path/config.json npm run setup:telegram, then restart the application.",
      retryAt: this.retryAt ? new Date(this.retryAt).toISOString() : undefined,
    };
  }
  async start(
    onSignal: (id: string) => void,
    onError: (code: string) => void,
    onConnected: () => void = () => {},
  ) {
    this.signal = onSignal;
    this.report = onError;
    this.onConnected = onConnected;
    this.stopped = false;
    this.cancellation = new AbortController();
    await this.connect();
    if (this.stopped) return;
    this.timer = setInterval(() => {
      if (
        !this.stopped &&
        (!this.client?.connected || this.state !== "connected") &&
        Date.now() >= this.retryAt
      )
        void this.connect();
    }, 1000);
  }
  private async connect() {
    if (this.connecting || this.stopped) return;
    this.connecting = true;
    this.state = "connecting";
    try {
      if (!this.client) {
        this.client = makeClient(this.config);
        this.client.onError = async (error) => {
          if (!this.stopped) this.report(this.providerError(error).code);
        };
      }
      await abortable(this.client.session.load(), this.cancellation.signal);
      if (!this.client.session.authKey)
        throw new ProviderError("TELEGRAM_AUTH");
      await abortable(this.client.connect(), this.cancellation.signal);
      if (this.stopped) {
        await this.client.destroy();
        return;
      }
      await abortable(
        this.client.invoke(new Api.updates.GetState()),
        this.cancellation.signal,
      );
      for await (const _dialog of abortableItems(
        this.client.iterDialogs({}),
        this.cancellation.signal,
      )) {
        /* rebuild provider-only access-hash cache after restart */
      }
      if (this.stopped) {
        await this.client.destroy();
        return;
      }
      this.state = "connected";
      this.failures = 0;
      this.retryAt = 0;
      this.installEvents();
      this.onConnected();
    } catch (error) {
      if (this.stopped) return;
      const failure = this.providerError(error);
      this.report(failure.code);
      this.state =
        failure.code === "TELEGRAM_WAIT" ? "waiting" : "disconnected";
      this.retryAt =
        Date.now() +
        (failure.retryAfterSeconds
          ? failure.retryAfterSeconds * 1000
          : Math.min(300_000, 5000 * 2 ** Math.min(this.failures++, 6)));
    } finally {
      this.connecting = false;
    }
  }
  private eventsInstalled = false;
  protected installEvents() {
    if (this.eventsInstalled || !this.client) return;
    this.eventsInstalled = true;
    this.client.addEventHandler(async (event) => {
      if (this.stopped) return;
      const id = event.message.chatId?.toString();
      if (id) this.signal(id);
    }, new NewMessage({}));
  }
  protected ready(): TelegramClient {
    if (this.stopped) throw new ProviderError("TELEGRAM_STOPPED");
    if (
      !this.client ||
      this.status().state !== "connected" ||
      this.retryAt > Date.now()
    )
      throw new ProviderError("TELEGRAM_CONNECTION");
    return this.client;
  }
  protected providerError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    const rpc = error as {
      errorMessage?: string;
      seconds?: number;
      message?: string;
    };
    const code = rpc.errorMessage || rpc.message || "";
    if (typeof rpc.seconds === "number" && rpc.seconds > 0) {
      this.retryAt = Date.now() + rpc.seconds * 1000;
      this.state = "waiting";
      return new ProviderError("TELEGRAM_WAIT", rpc.seconds);
    }
    if (/AUTH_KEY|SESSION_|UNAUTHORIZED|TELEGRAM_AUTH/.test(code)) {
      this.state = "disconnected";
      return new ProviderError("TELEGRAM_AUTH");
    }
    if (
      /CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|USER_BANNED|CHANNEL_INVALID|CHAT_ID_INVALID/.test(
        code,
      )
    )
      return new ProviderError("TELEGRAM_ACCESS");
    if (/HISTORY|MSG_ID_INVALID/.test(code))
      return new ProviderError("TELEGRAM_HISTORY");
    return new ProviderError("TELEGRAM_CONNECTION");
  }
  async stop() {
    this.stopped = true;
    this.cancellation.abort(new ProviderError("TELEGRAM_STOPPED"));
    if (this.timer) clearInterval(this.timer);
    await this.client?.destroy();
    this.state = "disconnected";
  }
  async sendNotification(request: NotificationRequest, signal: AbortSignal) {
    try {
      await sendTelegramReport(
        this.ready(),
        request,
        AbortSignal.any([
          signal,
          this.cancellation.signal,
          AbortSignal.timeout(20000),
        ]),
      );
    } catch (error) {
      if (error instanceof NotificationError && error.cause)
        this.providerError(error.cause);
      else if (!(error instanceof NotificationError)) this.providerError(error);
      if (error instanceof NotificationError) throw error;
      throw new NotificationError("TELEGRAM_REPORT_CONNECTION");
    }
  }
  async publish(request: PublicationRequest, recordIds: (ids: string[]) => void) {
    try {
      return await publishTelegram(this.ready(), request, this.cancellation.signal, recordIds);
    } catch (error) {
      if (error instanceof PublicationError && error.cause !== undefined)
        this.providerError(error.cause);
      throw this.providerError(error);
    }
  }
  async deletePublication(destination: PublicationDestination, ids: string[]) {
    try {
      const client = this.ready();
      const messages = await abortable(client.getMessages(destination.externalId, { ids: ids.map(Number) }), this.cancellation.signal);
      const present = messages.filter(message => message instanceof Api.Message && ids.includes(String(message.id))).map(message => message.id);
      if (present.length) await abortable(client.deleteMessages(destination.externalId, present, { revoke: true }), this.cancellation.signal);
    } catch (error) {
      throw this.providerError(error);
    }
  }
  async verifyPublication(request: PublicationRequest, ids: string[], since: string) {
    try {
      await verifyTelegramPublication(this.ready(), request, ids, since, this.cancellation.signal);
    } catch (error) {
      throw this.providerError(error);
    }
  }
  async listSources(): Promise<DiscoveredSource[]> {
    return abortable(this.discoverSources(), this.cancellation.signal);
  }
  private async discoverSources(): Promise<DiscoveredSource[]> {
    const client = this.ready();
    const results: DiscoveredSource[] = [];
    try {
      for await (const dialog of abortableItems(
        client.iterDialogs({}),
        this.cancellation.signal,
      )) {
        const entity = dialog.entity;
        if (
          !entity ||
          entity instanceof Api.UserEmpty ||
          entity instanceof Api.ChatEmpty ||
          entity instanceof Api.ChatForbidden ||
          entity instanceof Api.ChannelForbidden
        )
          continue;
        const externalId = dialog.id!.toString();
        const username = "username" in entity ? entity.username : undefined;
        const source: DiscoveredSource = {
          externalId,
          name: dialog.title || "Unavailable",
          kind:
            entity instanceof Api.User
              ? "private"
              : entity instanceof Api.Channel && !entity.megagroup
                ? "channel"
                : "group",
          url: username ? "https://t.me/" + username : undefined,
        };
        results.push(source);
        if (entity instanceof Api.Channel && entity.forum) {
          let offsetDate = 0,
            offsetId = 0,
            offsetTopic = 0;
          while (true) {
            const response = await abortable(
              client.invoke(
                new Api.channels.GetForumTopics({
                  channel: entity,
                  offsetDate,
                  offsetId,
                  offsetTopic,
                  limit: 100,
                }),
              ),
              this.cancellation.signal,
            );
            const topics = response.topics.filter(
              (topic): topic is Api.ForumTopic =>
                topic instanceof Api.ForumTopic,
            );
            for (const topic of topics)
              results.push({
                ...source,
                topicId: String(topic.id),
                kind: "topic",
                name: source.name + " / " + topic.title,
                url: source.url ? source.url + "/" + topic.id : undefined,
              });
            const last = topics[topics.length - 1];
            if (
              !last ||
              response.topics.length < 100 ||
              last.id === offsetTopic
            )
              break;
            offsetTopic = last.id;
            offsetId = last.topMessage;
            offsetDate =
              response.messages.find(
                (m): m is Api.Message =>
                  m instanceof Api.Message && m.id === last.topMessage,
              )?.date || last.date;
          }
        }
      }
      return results;
    } catch (error) {
      throw this.providerError(error);
    }
  }
  async currentPosition(externalSourceId: string): Promise<string> {
    try {
      const messages = await abortable(
        this.ready().getMessages(externalSourceId, { limit: 1 }),
        this.cancellation.signal,
      );
      return String(messages[0]?.id || 0);
    } catch (error) {
      throw this.providerError(error);
    }
  }
  async *recover(
    externalSourceId: string,
    after: string,
  ): AsyncIterable<IncomingItem> {
    const client = this.ready();
    try {
      // An idle source needs only the head lookup. Avoid entity/full-channel and
      // history requests on every poll when there is nothing new to recover.
      const upper = Number(await this.currentPosition(externalSourceId));
      if (BigInt(upper) <= BigInt(after)) return;
      const entity = await abortable(
        client.getEntity(externalSourceId),
        this.cancellation.signal,
      );
      if (entity instanceof Api.Channel) {
        const full = await abortable(
          client.invoke(new Api.channels.GetFullChannel({ channel: entity })),
          this.cancellation.signal,
        );
        if (
          full.fullChat instanceof Api.ChannelFull &&
          full.fullChat.availableMinId &&
          BigInt(after) < BigInt(full.fullChat.availableMinId)
        )
          this.report("TELEGRAM_HISTORY");
      }
      for await (const message of abortableItems(
        history(client, externalSourceId, after, upper),
        this.cancellation.signal,
      )) {
        if (!Number.isFinite(message.date)) {
          yield {
            accountId: this.accountId,
            externalSourceId,
            externalItemId: String(message.id),
            identity: "message:" + message.id,
            position: String(message.id),
            eventTime: new Date(0).toISOString(),
            text: "",
            attachments: [],
          };
          continue;
        }
        const sender = message.sender;
        let details: Sender | undefined;
        if (sender instanceof Api.User)
          details = {
            id: sender.id.toString(),
            name:
              [sender.firstName, sender.lastName].filter(Boolean).join(" ") ||
              undefined,
            username: sender.username,
          };
        else if (sender instanceof Api.Channel || sender instanceof Api.Chat)
          details = {
            id: utils.getPeerId(sender).toString(),
            name: sender.title,
          };
        else if (message.senderId || message.postAuthor)
          details = {
            id: message.senderId?.toString(),
            name: message.postAuthor,
          };
        const reply = message.replyTo;
        let topicId: string | undefined;
        if (entity instanceof Api.Channel && entity.forum) {
          topicId = "1";
          if (reply instanceof Api.MessageReplyHeader && reply.forumTopic)
            topicId = String(reply.replyToTopId || reply.replyToMsgId || 1);
          if (message.action instanceof Api.MessageActionTopicCreate)
            topicId = String(message.id);
        }
        let url: string | undefined;
        if (entity instanceof Api.Channel)
          url = entity.username
            ? "https://t.me/" + entity.username + "/" + message.id
            : "https://t.me/c/" + entity.id.toString() + "/" + message.id;
        const albumId = message.groupedId?.toString();
        yield {
          accountId: this.accountId,
          externalSourceId,
          externalItemId: String(message.id),
          identity: albumId ? "album:" + albumId : "message:" + message.id,
          position: String(message.id),
          topicId,
          albumId,
          eventTime: new Date(message.date * 1000).toISOString(),
          text: message.message || "",
          sender: details,
          url,
          attachments: attachments(message),
        };
      }
    } catch (error) {
      throw this.providerError(error);
    }
  }
}

function attachments(message: Api.Message): Attachment[] {
  if (message.photo) return [{ type: "image" }];
  const doc = message.document;
  if (!doc)
    return message.media && !(message.media instanceof Api.MessageMediaWebPage)
      ? [{ type: "other" }]
      : [];
  let type: Attachment["type"] = "document";
  for (const attr of doc.attributes) {
    if (attr instanceof Api.DocumentAttributeSticker) type = "sticker";
    else if (attr instanceof Api.DocumentAttributeAnimated) type = "animation";
    else if (attr instanceof Api.DocumentAttributeVideo && type === "document")
      type = "video";
    else if (attr instanceof Api.DocumentAttributeAudio)
      type = attr.voice ? "voice" : "audio";
  }
  if (type === "document" && doc.mimeType.startsWith("image/")) type = "image";
  const name = doc.attributes.find(
    (a): a is Api.DocumentAttributeFilename =>
      a instanceof Api.DocumentAttributeFilename,
  )?.fileName;
  return [{ type, name, mimeType: doc.mimeType, size: Number(doc.size) }];
}
