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

test("hourly recurrence preserves cadence at boundaries and skips missed runs", () => {
  const calendar = { frequency: "hourly", intervalHours: 5 };
  const anchor = new Date("2026-12-31T23:15:30.000Z");
  assert.equal(nextOccurrence(calendar, anchor), "2027-01-01T04:15:30.000Z");
  for (const [after, expected] of [
    ["2026-12-31T22:00:00.000Z", "2026-12-31T23:15:30.000Z"],
    ["2026-12-31T23:15:30.000Z", "2027-01-01T04:15:30.000Z"],
    ["2027-01-01T04:15:29.999Z", "2027-01-01T04:15:30.000Z"],
    ["2027-01-01T04:15:30.000Z", "2027-01-01T09:15:30.000Z"],
    ["2027-01-03T01:00:00.000Z", "2027-01-03T01:15:30.000Z"],
  ]) {
    assert.equal(nextOccurrence(calendar, new Date(after), anchor), expected);
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

function fixture(t) {
  t.mock.timers.enable({
    apis: ["Date"],
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

function createSchedule({ store, publications, schedules }) {
  const source = store.addSource(
    { externalId: "123", name: "Group", kind: "group" },
    "0",
  );
  const post = publications.posts.save({ text: "Scheduled post", images: [] });
  return schedules.create({
    postId: post.id,
    sourceId: source.id,
    calendar: { frequency: "hourly", intervalHours: 5 },
  });
}

test("hourly schedules persist, replace publications and keep cadence through pause and Run Now", async (t) => {
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
    "2026-10-31T17:15:00.000Z",
  );
  schedules.tick();
  assert.equal(publications.list().total, 2);
  t.mock.timers.tick(3 * hour);
  schedules.tick();
  await settle(publications);
  assert.equal(publications.list().total, 3);
  assert.deepEqual(context.deleted, ["1", "2"]);
  assert.equal(
    schedules.get(schedule.id).nextRunAt,
    "2026-10-31T22:15:00.000Z",
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

test("slow scheduled publications skip intervals without shifting cadence", async (t) => {
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
    "2026-10-31T17:15:00.000Z",
  );
  schedules.tick();
  assert.equal(publications.list().total, 1);
});
