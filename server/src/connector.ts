import type {
  ConnectorStatus,
  DiscoveredSource,
  IncomingItem,
  ID,
  PublicationDestination,
  NotificationDestination,
  MatchImage,
} from "@monitor/shared";
/** Each adapter owns authorization, provider types, retry policy and recovery errors. */
export interface Connector {
  readonly accountId: ID;
  status(): ConnectorStatus;
  listSources(): Promise<DiscoveredSource[]>;
  start(
    onSignal: (externalSourceId: ID) => void,
    onError: (code: string) => void,
    onConnected?: () => void,
  ): Promise<void>;
  stop(): Promise<void>;
  currentPosition(externalSourceId: ID): Promise<string>;
  recover(externalSourceId: ID, after: string): AsyncIterable<IncomingItem>;
  findMatchImages?(
    request: MatchImageRequest,
    signal: AbortSignal,
  ): Promise<MatchImage[]>;
  downloadMatchImage?(
    externalSourceId: ID,
    externalItemId: ID,
    variant: "preview" | "full",
    signal: AbortSignal,
  ): Promise<Uint8Array>;
  sendNotification?(
    request: NotificationRequest,
    signal: AbortSignal,
  ): Promise<void>;
  publish?(
    request: PublicationRequest,
    recordIds: (ids: ID[]) => void,
  ): Promise<ID[]>;
  deletePublication?(
    destination: PublicationDestination,
    ids: ID[],
  ): Promise<void>;
  verifyPublication?(
    request: PublicationRequest,
    ids: ID[],
    since: string,
  ): Promise<void>;
}
export interface MatchImageRequest {
  externalSourceId: ID;
  identity: ID;
  externalItemId?: ID;
  eventTime: string;
}
export interface NotificationRequest {
  destination: NotificationDestination;
  text: string;
  randomId: ID;
}
export interface PublicationRequest {
  destination: PublicationDestination;
  text: string;
  entities?: import("@monitor/shared").TextEntity[];
  images: { name: string; data: Uint8Array }[];
  randomIds: ID[];
}
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
export class NotificationError extends ProviderError {
  constructor(
    code: string,
    public readonly permanent = false,
    retryAfterSeconds = 0,
    cause?: unknown,
  ) {
    super(code, retryAfterSeconds);
    this.cause = cause;
  }
}
export class PublicationError extends ProviderError {
  constructor(
    code: string,
    public readonly outcome: "not_sent" | "uncertain",
    cause?: unknown,
  ) {
    super(code);
    this.cause = cause;
  }
}
