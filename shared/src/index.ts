/** Provider IDs stay strings. UTC times are ISO 8601, positions are decimal strings. */
export type ID = string;
export type AttachmentType =
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "sticker"
  | "animation"
  | "other";
export interface Attachment {
  type: AttachmentType;
  name?: string;
  mimeType?: string;
  size?: number;
}
export interface Sender {
  id?: ID;
  name?: string;
  username?: string;
}
export interface DiscoveredSource {
  externalId: ID;
  topicId?: ID;
  name: string;
  kind: "group" | "channel" | "private" | "topic";
  url?: string;
}
export interface Source extends DiscoveredSource {
  id: ID;
  ownerId: ID;
  accountId: ID;
  enabled: boolean;
  position: string;
  selectedAt: string;
  error?: string;
}
export interface IncomingItem {
  accountId: ID;
  externalSourceId: ID;
  externalItemId: ID;
  identity: ID;
  position: string;
  startPosition?: string;
  topicId?: ID;
  albumId?: ID;
  eventTime: string;
  text: string;
  sender?: Sender;
  url?: string;
  attachments: Attachment[];
}
export type ConditionKind = "part" | "word" | "phrase" | "hashtag";
export interface TextCondition {
  kind: ConditionKind;
  value: string;
}
export interface RuleInput {
  sourceIds: ID[];
  enabled: boolean;
  conditions: TextCondition[];
  attachmentTypes: AttachmentType[];
}
export interface Rule extends RuleInput {
  id: ID;
  ownerId: ID;
  createdAt: string;
}
export interface Match {
  id: ID;
  ownerId: ID;
  accountId: ID;
  externalSourceId: ID;
  identity: ID;
  sourceName: string;
  sender?: Sender;
  text: string;
  url?: string;
  messageTime: string;
  matchedAt: string;
  ruleNames: string[];
  attachments: Attachment[];
  delivery?: EmailJob;
}
export interface EmailJob {
  id: ID;
  kind: "match" | "incident";
  status: "pending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  sentAt?: string;
}
export interface Activity {
  id: ID;
  level: "info" | "error";
  code: string;
  message: string;
  occurrences: number;
  openedAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
}
export interface ConnectorCapabilities {
  history: boolean;
  topics: boolean;
  attachmentMetadata: boolean;
  publication: boolean;
  deletion: boolean;
}
export interface ConnectorStatus {
  state: "disconnected" | "connecting" | "connected" | "waiting";
  accountId: ID;
  capabilities: ConnectorCapabilities;
  instruction: string;
  retryAt?: string;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface SafeSettings {
  publicOrigin: string;
  timezone: "UTC";
  smtpConfigured: boolean;
  telegramConfigured: boolean;
  sessionDays: number;
  configChangesRequireRestart: true;
}
export interface Dashboard {
  sources: number;
  enabledSources: number;
  rules: number;
  matches: number;
  pendingEmails: number;
  failedEmails: number;
  incidents: number;
  connector: ConnectorStatus;
}
export interface ApiError {
  error: string;
}

export interface PostImage {
  id: ID;
  name: string;
  mimeType: string;
  size: number;
}
export interface Post {
  id: ID;
  ownerId: ID;
  text: string;
  entities: TextEntity[];
  images: PostImage[];
  createdAt: string;
  updatedAt: string;
}
export interface PublicationDestination {
  externalId: ID;
  topicId?: ID;
  name: string;
  kind: "group" | "topic";
}
export interface CalendarSchedule {
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  weekday?: number;
  day?: number;
}
export interface Schedule {
  id: ID;
  ownerId: ID;
  accountId: ID;
  postId: ID;
  postHeading: string;
  destination: PublicationDestination;
  calendar: CalendarSchedule;
  paused: boolean;
  nextRunAt: string;
  previousDestination?: PublicationDestination;
  previousIds: ID[];
  createdAt: string;
  blockedRunId?: ID;
}
export interface PublicationRun {
  id: ID;
  accountId: ID;
  scheduleId?: ID;
  postId: ID;
  postName: string;
  destination: PublicationDestination;
  status:
    | "queued"
    | "deleting"
    | "publishing"
    | "sent"
    | "partial"
    | "failed"
    | "uncertain"
    | "cancelled";
  previousDestination?: PublicationDestination;
  previousIds: ID[];
  deletedIds: ID[];
  sentIds: ID[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type TextStyle =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "spoiler"
  | "code"
  | "pre"
  | "link"
  | "blockquote";
export interface TextEntity {
  type: TextStyle;
  offset: number;
  length: number;
  url?: string;
}
export function postHeading(post: { text: string; images: unknown[] }): string {
  return (
    post.text.trim().replace(/\s+/g, " ").slice(0, 100) ||
    `${post.images.length} image${post.images.length === 1 ? "" : "s"}`
  );
}
export function ruleHeading(
  rule: Pick<RuleInput, "conditions" | "attachmentTypes">,
): string {
  return (
    [
      ...rule.conditions.map(
        (condition) => `${condition.kind}: ${condition.value}`,
      ),
      ...rule.attachmentTypes,
    ].join(" · ") || "Unassigned rule"
  );
}
export function scheduleHeading(schedule: Schedule): string {
  const c = schedule.calendar;
  const day =
    c.frequency === "weekly"
      ? ` ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][c.weekday!]}`
      : c.frequency === "monthly"
        ? ` day ${c.day}`
        : "";
  return `${schedule.postHeading} → ${schedule.destination.name} · ${c.frequency}${day} ${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")} UTC`;
}
