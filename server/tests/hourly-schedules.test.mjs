import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scheduleHeading } from "@monitor/shared";
import { nextOccurrence, validateCalendar } from "../dist/calendar.js";
import { Storage } from "../dist/db.js";
import { Publications } from "../dist/publications.js";
import { Schedules } from "../dist/schedules.js";
import { Store } from "../dist/store.js";
import { PublicationError } from "../dist/connector.js";

const hour = 60 * 60 * 1000;

test("hourly intervals accept whole hours and discard calendar-only fields", () => {
  for (const intervalHours of [1, 3, 5, 24]) {
    assert.deepEqual(
      validateCalendar({
        frequency: "hourly",
        intervalHours,
        hour: 9,
        day: 31,
      }),
      { frequency: "hourly", intervalHours },
    );
  }
  for (const intervalHours of [
    undefined,
    null,
    "3",
    0,
    -1,
    1.5,
    25,
    NaN,
    Infinity,
  ]) {
    assert.throws(
      () => validateCalendar({ frequency: "hourly", intervalHours }),
      { status: 400 },
    );
  }
});

test("hourly recurrence counts elapsed hours from a successful publication", () => {
  const calendar = { frequency: "hourly", intervalHours: 6 };
  for (const [after, expected] of [
    ["2026-12-31T23:15:30.000Z", "2027-01-01T05:15:30.000Z"],
    ["2026-10-30T11:46:23.098Z", "2026-10-30T17:46:23.098Z"],
    ["2026-10-30T11:46:01.287Z", "2026-10-30T17:46:01.287Z"],
  ]) {
    assert.equal(nextOccurrence(calendar, new Date(after)), expected);
  }
});

test("calendar recurrences retain their UTC and month-end behavior", () => {
  const monthly = { frequency: "monthly", day: 31, hour: 9, minute: 0 };
  assert.equal(
    nextOccurrence(monthly, new Date("2028-01-31T09:00:00Z")),
    "2028-02-29T09:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(monthly, new Date("2028-02-29T09:00:00Z")),
    "2028-03-31T09:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { frequency: "daily", hour: 9, minute: 0 },
      new Date("2026-12-31T09:00:00Z"),
    ),
    "2027-01-01T09:00:00.000Z",
  );
  assert.equal(
    nextOccurrence(
      { frequency: "weekly", weekday: 5, hour: 9, minute: 0 },
      new Date("2026-12-25T09:00:00Z"),
    ),
    "2027-01-01T09:00:00.000Z",
  );
});

function fixture(t, timers = []) {
  t.mock.timers.enable({
    apis: ["Date", ...timers],
    now: new Date("2026-10-30T21:15:00Z"),
  });
  const directory = mkdtempSync(join(tmpdir(), "reposter-hourly-"));
  const path = join(directory, "test.sqlite");
  let db = new Storage(path);
  let services;
  const sent = [];
  const deleted = [];
  const connector = {
    status: () => ({ state: "connected", capabilities: { publication: true } }),
    publish: async () => {
      const id = String(sent.length + 1);
      sent.push(id);
      return [id];
    },
    deletePublication: async (_destination, ids) => deleted.push(...ids),
  };
  const open = () => {
    const store = new Store(db);
    const publications = new Publications(store, connector);
    const schedules = new Schedules(store, publications);
    services = { store, publications, schedules };
    return services;
  };
  t.after(async () => {
    services.schedules.stop();
    await services.publications.stop();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    ...open(),
    connector,
    sent,
    deleted,
    async restart() {
      await services.publications.stop();
      db.close();
      db = new Storage(path);
      return open();
    },
  };
}

async function settle(publications) {
  for (let attempt = 0; attempt < 50; attempt++) {
    publications.wake();
    if (publications.list().items.every((run) => run.status === "sent")) return;
    await new Promise(setImmediate);
  }
  assert.fail(
    `Publications did not finish: ${JSON.stringify(publications.list().items)}`,
  );
}

function createSchedule({ store, publications, schedules }, intervalHours = 5) {
  const source = store.addSource(
    { externalId: "123", name: "Group", kind: "group" },
    "0",
  );
  const post = publications.posts.save({ text: "Scheduled post", images: [] });
  return schedules.create({
    postId: post.id,
    sourceId: source.id,
    calendar: { frequency: "hourly", intervalHours },
  });
}

test("hourly schedules persist and count the next interval from resumed publication", async (t) => {
  const context = fixture(t);
  let { publications, schedules } = context;
  const schedule = createSchedule(context);
  assert.equal(schedule.nextRunAt, "2026-10-31T02:15:00.000Z");
  assert.match(scheduleHeading(schedule), /Every 5 hours$/);
  schedules.pause(schedule.id, true);
  publications.start();
  schedules.runNow(schedule.id);
  await settle(publications);
  assert.equal(schedules.get(schedule.id).nextRunAt, schedule.nextRunAt);
  t.mock.timers.tick(17 * hour);
  ({ publications, schedules } = await context.restart());
  publications.start();
  schedules.tick();
  assert.equal(publications.list().total, 1);
  assert.equal(schedules.get(schedule.id).paused, true);
  schedules.pause(schedule.id, false);
  schedules.tick();
  await settle(publications);
  assert.equal(publications.list().total, 2);
  assert.deepEqual(context.deleted, ["1"]);
  assert.equal(
    schedules.get(schedule.id).nextRunAt,
    "2026-10-31T19:15:00.000Z",
  );
  schedules.tick();
  assert.equal(publications.list().total, 2);
  t.mock.timers.tick(5 * hour);
  schedules.tick();
  await settle(publications);
  assert.equal(publications.list().total, 3);
  assert.deepEqual(context.deleted, ["1", "2"]);
  assert.equal(
    schedules.get(schedule.id).nextRunAt,
    "2026-11-01T00:15:00.000Z",
  );
});

test("hourly edits preserve the next run unless recurrence changes", async (t) => {
  const context = fixture(t);
  const { publications, schedules } = context;
  const schedule = createSchedule(context);
  schedules.pause(schedule.id, true);
  t.mock.timers.tick(hour);
  const post = publications.posts.save({ text: "Different post", images: [] });
  let updated = schedules.update(schedule.id, {
    postId: post.id,
    calendar: schedule.calendar,
  });
  assert.equal(updated.nextRunAt, schedule.nextRunAt);
  assert.equal(updated.paused, true);
  updated = schedules.update(schedule.id, {
    postId: post.id,
    calendar: { frequency: "hourly", intervalHours: 3 },
  });
  assert.equal(updated.nextRunAt, "2026-10-31T01:15:00.000Z");
  assert.equal(updated.paused, true);
  schedules.runNow(schedule.id);
  assert.throws(
    () =>
      schedules.update(schedule.id, {
        postId: post.id,
        calendar: schedule.calendar,
      }),
    { status: 409 },
  );
  assert.throws(() => schedules.remove(schedule.id), { status: 409 });
  publications.start();
  await settle(publications);
  updated = schedules.update(schedule.id, {
    postId: post.id,
    calendar: { frequency: "daily", hour: 9, minute: 0 },
  });
  assert.equal(updated.nextRunAt, "2026-10-31T09:00:00.000Z");
});

test("slow scheduled publications wait a full interval after successful completion", async (t) => {
  const context = fixture(t);
  const { publications, schedules, connector } = context;
  const schedule = createSchedule(context);
  connector.publish = async () => {
    t.mock.timers.tick(12 * hour);
    return ["slow"];
  };
  t.mock.timers.tick(5 * hour);
  publications.start();
  schedules.tick();
  await settle(publications);
  assert.equal(
    schedules.get(schedule.id).nextRunAt,
    "2026-10-31T19:15:00.000Z",
  );
  schedules.tick();
  assert.equal(publications.list().total, 1);
});

test("Run Now restarts an hourly interval from successful completion", async (t) => {
  const context = fixture(t);
  const { publications, schedules } = context;
  const schedule = createSchedule(context, 6);
  schedules.pause(schedule.id, true);
  t.mock.timers.tick(hour);
  publications.start();
  schedules.runNow(schedule.id);
  await settle(publications);
  assert.equal(schedules.get(schedule.id).nextRunAt, "2026-10-31T04:15:00.000Z");
  assert.equal(schedules.get(schedule.id).paused, true);
  const restarted = await context.restart();
  assert.equal(restarted.schedules.get(schedule.id).nextRunAt, "2026-10-31T04:15:00.000Z");
});

test("changing an interval uses that schedule's last successful publication", async (t) => {
  const context = fixture(t);
  const { publications, schedules } = context;
  const first = createSchedule(context);
  const second = schedules.create({
    postId: first.postId,
    sourceId: context.store.sources()[0].id,
    calendar: { frequency: "daily", hour: 9, minute: 0 },
  });
  publications.start();
  schedules.runNow(first.id);
  await settle(publications);
  t.mock.timers.tick(hour);
  schedules.runNow(second.id);
  await settle(publications);
  t.mock.timers.tick(3 * hour);
  for (const schedule of [first, second])
    schedules.update(schedule.id, {
      postId: schedule.postId,
      calendar: { frequency: "hourly", intervalHours: 6 },
    });
  assert.equal(schedules.get(first.id).nextRunAt, "2026-10-31T03:15:00.000Z");
  assert.equal(schedules.get(second.id).nextRunAt, "2026-10-31T04:15:00.000Z");
  t.mock.timers.tick(2 * hour);
  schedules.tick();
  await settle(publications);
  assert.equal(publications.list().total, 3);
  assert.equal(schedules.get(first.id).nextRunAt, "2026-10-31T09:15:00.000Z");
  assert.equal(schedules.get(second.id).nextRunAt, "2026-10-31T04:15:00.000Z");
  t.mock.timers.tick(hour);
  schedules.tick();
  await settle(publications);
  assert.equal(publications.list().total, 4);
  assert.equal(schedules.get(second.id).nextRunAt, "2026-10-31T10:15:00.000Z");
});

test("failed Run Now leaves the interval unchanged until a retry succeeds", async (t) => {
  const context = fixture(t);
  const { publications, schedules, connector } = context;
  const schedule = createSchedule(context, 6);
  connector.publish = async () => {
    throw new PublicationError("PUBLICATION_REJECTED", "not_sent");
  };
  publications.start();
  t.mock.timers.tick(hour);
  const run = schedules.runNow(schedule.id);
  for (let attempt = 0; attempt < 50 && publications.get(run.id).status !== "failed"; attempt++) {
    publications.wake();
    await new Promise(setImmediate);
  }
  assert.equal(publications.get(run.id).status, "failed");
  assert.equal(schedules.get(schedule.id).nextRunAt, schedule.nextRunAt);
  t.mock.timers.tick(hour);
  connector.publish = async () => ["retried"];
  publications.retry(run.id);
  await settle(publications);
  assert.equal(schedules.get(schedule.id).nextRunAt, "2026-10-31T05:15:00.000Z");
});

test("manual calendar publications preserve their recurring time", async (t) => {
  const context = fixture(t);
  const { publications, schedules } = context;
  const schedule = createSchedule(context);
  const daily = schedules.update(schedule.id, {
    postId: schedule.postId,
    calendar: { frequency: "daily", hour: 9, minute: 0 },
  });
  publications.start();
  t.mock.timers.tick(hour);
  schedules.runNow(schedule.id);
  await settle(publications);
  assert.equal(schedules.get(schedule.id).nextRunAt, daily.nextRunAt);
});

test("upgrading corrects existing hourly due times without altering blocked or calendar schedules", async (t) => {
  const context = fixture(t);
  const { store, publications, schedules } = context;
  const first = createSchedule(context, 6);
  const source = store.sources()[0];
  const create = (calendar) => schedules.create({ postId: first.postId, sourceId: source.id, calendar });
  const paused = create({ frequency: "hourly", intervalHours: 6 });
  schedules.pause(paused.id, true);
  const blocked = create({ frequency: "hourly", intervalHours: 6 });
  const daily = create({ frequency: "daily", hour: 9, minute: 0 });
  const unpublished = create({ frequency: "hourly", intervalHours: 6 });
  for (const schedule of [first, paused, blocked, daily]) {
    const run = publications.queue(schedule.postId, schedule.destination, schedule.id);
    store.db.run(
      "UPDATE publication_runs SET status='sent',completed_at='2026-10-30T11:46:23.098Z' WHERE id=?",
      run.id,
    );
  }
  publications.queue(blocked.postId, blocked.destination, blocked.id);
  store.db.run("ALTER TABLE schedules DROP COLUMN last_published_at");
  store.db.run("DELETE FROM migrations WHERE version='012-publication-based-intervals.sql'");
  const restarted = await context.restart();
  assert.equal(restarted.schedules.get(first.id).nextRunAt, "2026-10-30T17:46:23.098Z");
  assert.equal(restarted.schedules.get(paused.id).nextRunAt, "2026-10-30T17:46:23.098Z");
  assert.equal(restarted.schedules.get(paused.id).paused, true);
  assert.equal(restarted.schedules.get(blocked.id).nextRunAt, blocked.nextRunAt);
  assert.equal(restarted.schedules.get(daily.id).nextRunAt, daily.nextRunAt);
  assert.equal(restarted.schedules.get(unpublished.id).nextRunAt, unpublished.nextRunAt);
  restarted.publications.start();
  restarted.schedules.tick();
  await settle(restarted.publications);
  assert.equal(restarted.publications.list().total, 6);
  assert.equal(restarted.schedules.get(first.id).nextRunAt, "2026-10-31T03:15:00.000Z");
  assert.equal(restarted.schedules.get(paused.id).nextRunAt, "2026-10-30T17:46:23.098Z");
});

test("timer callbacks publish two six-hour schedules without browser activity", async (t) => {
  const context = fixture(t, ["setInterval"]);
  const { publications, schedules, store } = context;
  const first = createSchedule(context, 6);
  const secondSource = store.addSource(
    { externalId: "456", name: "Another group", kind: "group" },
    "0",
  );
  const second = schedules.create({
    postId: first.postId,
    sourceId: secondSource.id,
    calendar: first.calendar,
  });
  publications.start();
  schedules.start();
  await new Promise(setImmediate);
  assert.equal(publications.list().total, 0);
  t.mock.timers.setTime(Date.parse(first.nextRunAt));
  for (let attempt = 0; attempt < 10 && context.sent.length < 2; attempt++) {
    t.mock.timers.tick(1000);
    await new Promise(setImmediate);
  }
  assert.equal(context.sent.length, 2);
  for (const schedule of [first, second]) {
    const run = publications.list().items.find((run) => run.scheduleId === schedule.id);
    assert.equal(run.status, "sent");
    assert.equal(
      schedules.get(schedule.id).nextRunAt,
      new Date(Date.parse(run.completedAt) + 6 * hour).toISOString(),
    );
  }
});

test("deleting publication history preserves the interval's last successful publication", async (t) => {
  const context = fixture(t);
  const { publications, schedules } = context;
  const schedule = createSchedule(context);
  publications.start();
  const run = schedules.runNow(schedule.id);
  await settle(publications);
  publications.remove(run.id);
  t.mock.timers.tick(4 * hour);
  schedules.update(schedule.id, {
    postId: schedule.postId,
    calendar: { frequency: "hourly", intervalHours: 6 },
  });
  assert.equal(publications.list().total, 0);
  assert.equal(schedules.get(schedule.id).nextRunAt, "2026-10-31T03:15:00.000Z");
  const restarted = await context.restart();
  assert.equal(restarted.schedules.get(schedule.id).nextRunAt, "2026-10-31T03:15:00.000Z");
});
