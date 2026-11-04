import type { PublicationDestination } from "@monitor/shared";

export function telegramPublicationMessageUrl(
  destination: PublicationDestination,
  id: string,
): string | undefined {
  const channel = destination.externalId.match(/^-100([1-9]\d*)$/)?.[1];
  if (!channel || !validMessageId(id)) return undefined;
  if (destination.topicId && !validMessageId(destination.topicId))
    return undefined;
  const topic = destination.topicId ? `${destination.topicId}/` : "";
  return `https://t.me/c/${channel}/${topic}${id}`;
}

function validMessageId(id: string): boolean {
  return /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647;
}
