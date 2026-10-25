import type {
  ConnectorStatus,
  DiscoveredSource,
  IncomingItem,
  ID,
  PublicationDestination,
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
export interface PublicationRequest {
  destination: PublicationDestination;
  text: string;
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
