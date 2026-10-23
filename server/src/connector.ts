import type {
  ConnectorStatus,
  DiscoveredSource,
  IncomingItem,
  ID,
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
}
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
