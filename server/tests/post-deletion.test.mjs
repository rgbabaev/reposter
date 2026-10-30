import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Storage } from "../dist/db.js";
import { Publications } from "../dist/publications.js";
import { Schedules } from "../dist/schedules.js";
import { Store } from "../dist/store.js";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "reposter-post-deletion-"));
  const store = new Store(new Storage(join(directory, "test.sqlite")));
  const deletedMessages = [];
  const connector = {
    status: () => ({ state: "connected", capabilities: { publication: true } }),
    publish: async () => ["456"],
    deletePublication: async (_destination, ids) => deletedMessages.push(...ids),
  };
  const publications = new Publications(store, connector);
  const schedules = new Schedules(store, publications);
  const source = store.addSource(
    { externalId: "123", name: "Group", kind: "group" },
    "0",
  );
  const createPost = (text = "Post", images = []) =>
    publications.posts.save({ text, images });
  const createSchedule = (post) =>
    schedules.create({
      postId: post.id,
      sourceId: source.id,
      calendar: { frequency: "daily", hour: 9, minute: 0 },
    });
  const recordRun = (post, status = "sent", schedule) => {
    const run = publications.queue(
      post.id,
      publications.destination(source.id),
      schedule?.id,
    );
    store.db.run("UPDATE publication_runs SET status=? WHERE id=?", status, run.id);
    return publications.get(run.id);
  };
  t.after(async () => {
    await publications.stop();
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    store, publications, schedules, deletedMessages,
    createPost, createSchedule, recordRun,
  };
}

test("deleting a post removes completed and failed history and all uploaded images", (t) => {
  const { store, publications, createPost, recordRun, deletedMessages } = fixture(t);
  const post = createPost("Delete me", [{
    mimeType: "image/png",
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR9sAAAAASUVORK5CYII=",
  }]);
  for (const status of ["sent", "partial", "cancelled", "failed"])
    recordRun(post, status);
  publications.posts.save({ text: "Edited post", images: [] }, post.id);
  assert.equal(store.db.get("SELECT count(*) n FROM post_images WHERE post_id=?", post.id).n, 1);
  const other = createPost("Keep me");
  const otherRun = recordRun(other);

  publications.posts.remove(post.id);

  assert.throws(() => publications.posts.get(post.id), { status: 404 });
  assert.equal(store.db.get("SELECT count(*) n FROM post_images WHERE post_id=?", post.id).n, 0);
  assert.deepEqual(publications.list().items, [otherRun]);
  assert.equal(publications.posts.get(other.id).text, "Keep me");
  assert.deepEqual(deletedMessages, []);
  assert.deepEqual(store.db.all("PRAGMA foreign_key_check"), []);
});

test("existing and paused schedules prevent deleting a post or its history", (t) => {
  const { publications, schedules, createPost, createSchedule, recordRun } = fixture(t);
  const post = createPost();
  const schedule = createSchedule(post);
  const run = recordRun(post, "sent", schedule);
  for (const paused of [false, true]) {
    schedules.pause(schedule.id, paused);
    assert.throws(() => publications.posts.remove(post.id), {
      status: 409,
      message: "Posts used by schedules cannot be deleted.",
    });
    assert.deepEqual(publications.get(run.id), run);
    assert.equal(publications.posts.get(post.id).id, post.id);
  }
});

test("deleted schedules no longer prevent post deletion", (t) => {
  const { store, publications, schedules, createPost, createSchedule, recordRun } = fixture(t);
  const post = createPost();
  const schedule = createSchedule(post);
  recordRun(post, "sent", schedule);
  schedules.remove(schedule.id);

  publications.posts.remove(post.id);

  assert.equal(publications.posts.list().total, 0);
  assert.equal(publications.list().total, 0);
  assert.equal(store.db.get("SELECT id FROM schedules WHERE id=?", schedule.id), undefined);
});

test("deleting an old post preserves a surviving schedule's next replacement", async (t) => {
  const { publications, schedules, store, createPost, createSchedule, recordRun, deletedMessages } = fixture(t);
  const oldPost = createPost("Old post");
  const schedule = createSchedule(oldPost);
  recordRun(oldPost, "sent", schedule);
  store.db.run("UPDATE schedules SET previous_ids='[\"123\"]',previous_destination=destination WHERE id=?", schedule.id);
  const nextPost = createPost("Next post");
  schedules.update(schedule.id, { postId: nextPost.id, calendar: schedule.calendar });
  const before = schedules.get(schedule.id);

  publications.posts.remove(oldPost.id);

  assert.deepEqual(schedules.get(schedule.id), before);
  assert.equal(publications.list().total, 0);
  const nextRun = schedules.runNow(schedule.id);
  publications.start();
  for (let attempt = 0; attempt < 50 && publications.get(nextRun.id).status !== "sent"; attempt++)
    await new Promise(setImmediate);
  assert.equal(publications.get(nextRun.id).status, "sent");
  assert.deepEqual(deletedMessages, ["123"]);
  assert.deepEqual(schedules.get(schedule.id).previousIds, ["456"]);
});

test("cleaning up a deleted schedule preserves other posts' history", (t) => {
  const { store, publications, schedules, createPost, createSchedule, recordRun } = fixture(t);
  const oldPost = createPost("Old post");
  const schedule = createSchedule(oldPost);
  const oldRun = recordRun(oldPost, "sent", schedule);
  const nextPost = createPost("Next post");
  schedules.update(schedule.id, { postId: nextPost.id, calendar: schedule.calendar });
  recordRun(nextPost, "sent", schedule);
  schedules.remove(schedule.id);

  publications.posts.remove(nextPost.id);

  assert.deepEqual(publications.get(oldRun.id), { ...oldRun, scheduleId: undefined });
  assert.equal(publications.posts.get(oldPost.id).id, oldPost.id);
  assert.equal(publications.list().total, 1);
  assert.deepEqual(store.db.all("PRAGMA foreign_key_check"), []);
});

test("queued, running and uncertain work still prevents post deletion", (t) => {
  const { publications, createPost, recordRun } = fixture(t);
  for (const status of ["queued", "deleting", "publishing", "uncertain"]) {
    const post = createPost(status);
    const run = recordRun(post, status);
    assert.throws(() => publications.posts.remove(post.id), { status: 409 });
    assert.deepEqual(publications.get(run.id), run);
    assert.equal(publications.posts.get(post.id).id, post.id);
  }
});

test("a failed post deletion rolls back history and deleted schedule cleanup", (t) => {
  const { store, publications, schedules, createPost, createSchedule, recordRun } = fixture(t);
  const oldPost = createPost("Old post");
  const schedule = createSchedule(oldPost);
  const oldRun = recordRun(oldPost, "sent", schedule);
  const post = createPost("Post");
  schedules.update(schedule.id, { postId: post.id, calendar: schedule.calendar });
  const run = recordRun(post, "sent", schedule);
  schedules.remove(schedule.id);
  store.db.run("CREATE TRIGGER reject_post_deletion BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT, 'Deletion failed'); END");

  assert.throws(() => publications.posts.remove(post.id), /Deletion failed/);

  assert.equal(publications.posts.get(post.id).id, post.id);
  assert.deepEqual(publications.get(run.id), run);
  assert.deepEqual(publications.get(oldRun.id), oldRun);
  assert.equal(store.db.get("SELECT post_id FROM schedules WHERE id=?", schedule.id).post_id, post.id);
});
