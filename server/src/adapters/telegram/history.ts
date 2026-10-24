import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import type { TelegramClient, Api } from "telegram";

/** Avoid GramJS RequestIter's negative, seconds-as-milliseconds wait calculation.
 * Small finite pages disable its automatic wait; pace page starts ourselves.
 */
export async function* history(
  client: TelegramClient,
  source: string,
  after: string,
  upper: number,
): AsyncIterable<Api.Message> {
  let cursor = Number(after);
  let nextPageAt = 0;
  while (cursor < upper) {
    const delay = nextPageAt - performance.now();
    if (delay > 0) await sleep(delay);
    nextPageAt = performance.now() + 1000;
    let count = 0;
    for await (const message of client.iterMessages(source, {
      minId: cursor,
      maxId: upper + 1,
      reverse: true,
      limit: 100,
      waitTime: 0,
    })) {
      if (message.id <= cursor || message.id > upper)
        throw new Error("Unexpected Telegram history position.");
      cursor = message.id;
      count++;
      yield message;
    }
    if (count < 100) return;
  }
}
