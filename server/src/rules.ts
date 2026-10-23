import type {
  AttachmentType,
  IncomingItem,
  Rule,
  RuleInput,
  TextCondition,
} from "@monitor/shared";
import { HttpError } from "./http.js";
export const attachmentTypes: AttachmentType[] = [
  "image",
  "video",
  "audio",
  "voice",
  "document",
  "sticker",
  "animation",
  "other",
];
const normalize = (text: string) => text.normalize("NFC");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function validateRule(input: Record<string, unknown>): RuleInput {
  if (typeof input.sourceId !== "string" || !input.sourceId)
    throw new HttpError(400, "A source is required.");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 120
  )
    throw new HttpError(400, "Rule name must contain 1–120 characters.");
  if (typeof input.enabled !== "boolean")
    throw new HttpError(400, "enabled must be boolean.");
  if (
    !Array.isArray(input.conditions) ||
    input.conditions.length < 1 ||
    input.conditions.length > 20
  )
    throw new HttpError(400, "Provide 1–20 non-empty text conditions.");
  const conditions: TextCondition[] = input.conditions.map((value) => {
    if (!value || typeof value !== "object")
      throw new HttpError(400, "Invalid text condition.");
    const condition = value as Record<string, unknown>;
    if (
      !["part", "word", "phrase", "hashtag"].includes(String(condition.kind)) ||
      typeof condition.value !== "string" ||
      !condition.value.trim() ||
      condition.value.length > 500
    )
      throw new HttpError(
        400,
        "Each condition needs a supported type and 1–500 characters.",
      );
    const text = condition.value.trim().normalize("NFC");
    if (condition.kind === "hashtag" && !/^#?[\p{L}\p{N}_\p{M}]+$/u.test(text))
      throw new HttpError(400, "A hashtag must be one complete tag.");
    return { kind: condition.kind as TextCondition["kind"], value: text };
  });
  if (
    !Array.isArray(input.attachmentTypes) ||
    !input.attachmentTypes.every((t) =>
      attachmentTypes.includes(t as AttachmentType),
    )
  )
    throw new HttpError(400, "Invalid attachment types.");
  return {
    sourceId: input.sourceId,
    name: input.name.trim(),
    enabled: input.enabled,
    conditions,
    attachmentTypes: [...new Set(input.attachmentTypes)] as AttachmentType[],
  };
}
export function matchesRule(rule: Rule, item: IncomingItem): boolean {
  if (!rule.enabled) return false;
  if (
    rule.attachmentTypes.length &&
    !item.attachments.some((a) => rule.attachmentTypes.includes(a.type))
  )
    return false;
  const text = normalize(item.text);
  return rule.conditions.every((condition) => {
    const value = normalize(condition.value);
    if (condition.kind === "part" || condition.kind === "phrase")
      return new RegExp(escape(value), "iu").test(text);
    if (condition.kind === "word")
      return new RegExp(
        "(^|[^\\p{L}\\p{N}])" + escape(value) + "(?=$|[^\\p{L}\\p{N}])",
        "iu",
      ).test(text);
    const tag = value.replace(/^#/, "");
    return [...text.matchAll(/#[\p{L}\p{N}_\p{M}]+/gu)].some((found) =>
      new RegExp("^" + escape(tag) + "$", "iu").test(found[0].slice(1)),
    );
  });
}
