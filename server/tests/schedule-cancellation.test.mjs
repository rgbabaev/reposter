import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Storage } from "../dist/db.js";
import { Publications } from "../dist/publications.js";
import { Schedules } from "../dist/schedules.js";
import { Store } from "../dist/store.js";

function fixture(t, status, paused) {
  const directory = mkdtempSync(join(tmpdir(), "reposter-schedule-cancel-"));
  const store = new Store(new Storage(join(directory, "test.sqlite")));
  const connector = {
    status: () => ({ state: "disconnected", capabilities: { publication: true } }),
    publish: async () => assert.fail("Cancellation must not publish."),
    deletePublication: async () => assert.fail("Cancellation must not delete Telegram messages."),
  };
  const publications = new Publications(store, connector);
  const schedules = new Schedules(store, publications);
  const source = store.addSource({ externalId: "-1001234567890", kind: "group", name: "Group" }, "0");
  const post = publications.posts.save({ text: "Scheduled post", images: [] });
  const schedule = schedules.create({ postId: post.id, sourceId: source.id, calendar: { frequency: "daily", hour: 9, minute: 0 } });
  schedules.pause(schedule.id, paused);
  const previousIds = ["101", "102"];
  store.db.run("UPDATE schedules SET previous_ids=?,previous_destination=destination WHERE id=?", JSON.stringify(previousIds), schedule.id);
  const run = publications.queue(post.id, schedule.destination, schedule.id, previousIds, "scheduled");
  store.db.run("UPDATE publication_runs SET status=?,deleted_ids='[\"101\"]',error='TELEGRAM_WAIT' WHERE id=?", status, run.id);
  t.after(() => {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { store, publications, schedules, schedule, run, post };
}

for (const status of ["queued", "failed"]) {
  test(`cancelling a ${status} run unlocks schedule deletion and preserves pause state and history`, (t) => {
    for (const paused of [false, true]) {
      const { publications, schedules, schedule, run, post } = fixture(t, status, paused);
      assert.equal(schedules.get(schedule.id).blockedRunId, run.id);
      assert.equal(schedules.get(schedule.id).blockedRunStatus, status);
      assert.equal(schedules.list().items[0].blockedRunStatus, status);
      assert.throws(() => schedules.remove(schedule.id), { status: 409 });

      publications.cancel(run.id);

      const unblocked = schedules.get(schedule.id);
      assert.equal(unblocked.blockedRunId, undefined);
      assert.equal(unblocked.blockedRunStatus, undefined);
      assert.equal(unblocked.paused, paused);
      assert.deepEqual(unblocked.previousIds, ["102"]);
      assert.deepEqual(unblocked.previousDestination, schedule.destination);
      schedules.remove(schedule.id);
      assert.throws(() => schedules.get(schedule.id), { status: 404 });
      assert.equal(publications.get(run.id).status, "cancelled");
      assert.equal(publications.posts.get(post.id).id, post.id);
    }
  });
}

for (const status of ["deleting", "publishing", "uncertain"]) {
  test(`${status} runs continue to block cancellation and schedule deletion`, (t) => {
    const { publications, schedules, schedule, run } = fixture(t, status, true);
    assert.equal(schedules.get(schedule.id).blockedRunStatus, status);
    assert.throws(() => publications.cancel(run.id), { status: 409 });
    assert.throws(() => schedules.remove(schedule.id), { status: 409 });
    assert.throws(() => schedules.runNow(schedule.id), { status: 409 });
    assert.equal(publications.get(run.id).status, status);
    assert.equal(schedules.get(schedule.id).paused, true);
  });
}
