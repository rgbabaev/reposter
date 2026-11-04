import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { telegramPublicationMessageUrl } from "../dist/adapters/telegram/message-links.js";
import { PublicationError, ProviderError } from "../dist/connector.js";
import { Storage } from "../dist/db.js";
import { Publications } from "../dist/publications.js";
import { Schedules } from "../dist/schedules.js";
import { Store } from "../dist/store.js";

const destination = {
  externalId: "-1001234567890",
  kind: "group",
  name: "Original group",
};

test("Telegram publication links support groups, topics and unavailable links", () => {
  assert.equal(telegramPublicationMessageUrl(destination, "42"), "https://t.me/c/1234567890/42");
  for (const topicId of ["1", "99"]) {
    assert.equal(
      telegramPublicationMessageUrl({ ...destination, kind: "topic", topicId }, "42"),
      `https://t.me/c/1234567890/${topicId}/42`,
    );
  }
  for (const externalId of ["-123456", "123456", "-10000123", "invalid"]) {
    assert.equal(telegramPublicationMessageUrl({ ...destination, externalId }, "42"), undefined);
  }
  for (const id of ["0", "-1", "2147483648", "42/43", "42?test", "42\n"]) {
    assert.equal(telegramPublicationMessageUrl(destination, id), undefined);
    assert.equal(telegramPublicationMessageUrl({ ...destination, topicId: id }, "42"), undefined);
  }
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "reposter-schedule-links-"));
  const path = join(directory, "test.sqlite");
  const deleted = [];
  const connector = {
    status: () => ({ state: "connected", capabilities: { publication: true } }),
    publicationMessageUrl: telegramPublicationMessageUrl,
    publish: async () => ["101", "102"],
    deletePublication: async (destination, ids) => deleted.push({ destination, ids }),
    verifyPublication: async () => {},
  };
  let services;
  const open = () => {
    const store = new Store(new Storage(path));
    const publications = new Publications(store, connector);
    const schedules = new Schedules(store, publications);
    services = { store, publications, schedules };
    return services;
  };
  t.after(async () => {
    await services.publications.stop();
    services.store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const initial = open();
  const source = initial.store.addSource(destination, "0");
  const image = {
    mimeType: "image/png",
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR9sAAAAASUVORK5CYII=",
  };
  const post = initial.publications.posts.save({ text: "Album", images: [image, image] });
  const schedule = initial.schedules.create({
    postId: post.id,
    sourceId: source.id,
    calendar: { frequency: "daily", hour: 9, minute: 0 },
  });
  return {
    ...initial, connector, deleted, post, schedule,
    async restart() {
      await services.publications.stop();
      services.store.db.close();
      return open();
    },
  };
}

async function waitForRun(publications, id, status) {
  for (let attempt = 0; attempt < 50; attempt++) {
    publications.wake();
    if (publications.get(id).status === status) return;
    await new Promise(setImmediate);
  }
  assert.equal(publications.get(id).status, status);
}

test("schedule links survive destination edits, history deletion and restart", async (t) => {
  const context = fixture(t);
  let { publications, schedules, store } = context;
  const { schedule } = context;
  assert.equal(schedules.get(schedule.id).currentPublication, undefined);
  publications.start();
  const run = schedules.runNow(schedule.id);
  await waitForRun(publications, run.id, "sent");
  const current = schedules.get(schedule.id).currentPublication;
  assert.deepEqual(current, {
    destination,
    messages: [
      { id: "101", url: "https://t.me/c/1234567890/101" },
      { id: "102", url: "https://t.me/c/1234567890/102" },
    ],
  });
  assert.deepEqual(schedules.list().items[0].currentPublication, current);
  const source = store.addSource({
    externalId: "-1009876543210", topicId: "77", kind: "topic", name: "New topic",
  }, "0");
  schedules.update(schedule.id, { postId: schedule.postId, sourceId: source.id, calendar: schedule.calendar });
  publications.remove(run.id);
  ({ publications, schedules, store } = await context.restart());
  assert.deepEqual(schedules.get(schedule.id).currentPublication, current);
  assert.equal(publications.list().total, 0);
  context.connector.publish = async () => ["201", "202"];
  publications.start();
  const replacement = schedules.runNow(schedule.id);
  await waitForRun(publications, replacement.id, "sent");
  assert.deepEqual(context.deleted.map((entry) => entry.destination), [destination, destination]);
  assert.deepEqual(schedules.get(schedule.id).currentPublication.messages, [
    { id: "201", url: "https://t.me/c/9876543210/77/201" },
    { id: "202", url: "https://t.me/c/9876543210/77/202" },
  ]);
});

test("replacement deletion checkpoints hide deleted messages after failure and cancellation", async (t) => {
  const { publications, schedules, schedule, connector } = fixture(t);
  publications.start();
  const run = schedules.runNow(schedule.id);
  await waitForRun(publications, run.id, "sent");
  connector.deletePublication = async (_destination, ids) => {
    if (ids[0] === "102") throw new ProviderError("PUBLICATION_DELETE");
  };
  const replacement = schedules.runNow(schedule.id);
  await waitForRun(publications, replacement.id, "failed");
  const messages = [{ id: "102", url: "https://t.me/c/1234567890/102" }];
  assert.deepEqual(schedules.get(schedule.id).currentPublication.messages, messages);
  publications.cancel(replacement.id);
  assert.deepEqual(schedules.get(schedule.id).currentPublication.messages, messages);
});

test("uncertain sends expose acknowledged messages at their actual destination", async (t) => {
  const { publications, schedules, store, schedule, connector } = fixture(t);
  publications.start();
  const run = schedules.runNow(schedule.id);
  await waitForRun(publications, run.id, "sent");
  const source = store.addSource({
    externalId: "-1009876543210", topicId: "77", kind: "topic", name: "New topic",
  }, "0");
  schedules.update(schedule.id, { postId: schedule.postId, sourceId: source.id, calendar: schedule.calendar });
  connector.publish = async (_request, recordIds) => {
    recordIds(["301"]);
    throw new PublicationError("PUBLICATION_UNCERTAIN", "uncertain");
  };
  const replacement = schedules.runNow(schedule.id);
  await waitForRun(publications, replacement.id, "uncertain");
  const current = schedules.get(schedule.id).currentPublication;
  assert.equal(current.destination.name, "New topic");
  assert.deepEqual(current.messages, [{ id: "301", url: "https://t.me/c/9876543210/77/301" }]);
  await publications.reconcile(replacement.id, { confirmed: true, messageIds: ["301"] });
  assert.deepEqual(schedules.get(schedule.id).currentPublication, current);
});

test("fully deleted publications disappear when replacement sends nothing", async (t) => {
  const { publications, schedules, schedule, connector } = fixture(t);
  publications.start();
  const run = schedules.runNow(schedule.id);
  await waitForRun(publications, run.id, "sent");
  connector.publish = async () => { throw new PublicationError("PUBLICATION_REJECTED", "not_sent"); };
  const replacement = schedules.runNow(schedule.id);
  await waitForRun(publications, replacement.id, "failed");
  assert.equal(schedules.get(schedule.id).currentPublication, undefined);
});

test("connectors without message links retain readable message IDs", async (t) => {
  const { publications, schedules, schedule, connector } = fixture(t);
  delete connector.publicationMessageUrl;
  publications.start();
  const run = schedules.runNow(schedule.id);
  await waitForRun(publications, run.id, "sent");
  assert.deepEqual(schedules.get(schedule.id).currentPublication.messages, [
    { id: "101", url: undefined }, { id: "102", url: undefined },
  ]);
});
