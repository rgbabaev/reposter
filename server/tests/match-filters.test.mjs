import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Storage } from "../dist/db.js";
import { Store } from "../dist/store.js";

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "reposter-match-filters-"));
  const store = new Store(new Storage(join(directory, "test.sqlite")));
  t.after(() => {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const addMatch = (id, sourceName, text = "Message", ruleNames = []) => {
    const match = {
      id, ownerId: "owner", accountId: "telegram", externalSourceId: id,
      identity: id, sourceName, text, ruleNames, attachments: [],
      messageTime: "2026-11-02T12:00:00.000Z",
      matchedAt: "2026-11-02T12:00:00.000Z",
    };
    store.db.run(
      "INSERT INTO matches VALUES(?,?,?,?,?,?,?)",
      id, match.ownerId, match.accountId, match.externalSourceId,
      match.identity, JSON.stringify(match), match.matchedAt,
    );
  };
  return { store, addMatch };
}

test("source filters match any exact selected name and treat special characters literally", (t) => {
  const { store, addMatch } = fixture(t);
  for (const [id, source] of [
    ["a", "Group"], ["b", "Group"], ["c", "group"],
    ["d", "100%_rent"], ["e", "' OR 1=1 --"],
  ]) addMatch(id, source);

  assert.equal(store.matches().total, 5);
  assert.equal(store.matches(1, 25, "", [], ["Group"]).total, 2);
  assert.equal(store.matches(1, 25, "", [], ["Group", "100%_rent"]).total, 3);
  assert.equal(store.matches(1, 25, "", [], ["' OR 1=1 --"]).total, 1);
  assert.equal(store.matches(1, 25, "", [], ["%", "Missing"]).total, 0);
  assert.equal(store.matches(1, 25, "", [], []).total, 5);
});

test("source, Unicode text and rule filters combine before counting and pagination", (t) => {
  const { store, addMatch } = fixture(t);
  addMatch("a", "Old source", "café rental", ["Old rule"]);
  addMatch("b", "Active source", "CAFE\u0301 rental", ["Old rule", "Other rule"]);
  addMatch("c", "Active source", "Different message", ["Other rule"]);
  addMatch("d", "Other source", "CAFÉ rental", ["Old rule"]);
  addMatch("e", "Old source", "rent", ["Other rule"]);
  addMatch("f", "Active source", "CAFÉ rental", ["Old rule"]);

  const first = store.matches(1, 2, " CAFE\u0301 ", ["Old rule"], ["Old source", "Active source"]);
  const second = store.matches(2, 2, "café", ["Old rule"], ["Old source", "Active source"]);
  assert.equal(first.total, 3);
  assert.equal(second.total, 3);
  assert.deepEqual(first.items.map((match) => match.id), ["f", "b"]);
  assert.deepEqual(second.items.map((match) => match.id), ["a"]);
  assert.deepEqual(first.sourceNames, ["Active source", "Old source", "Other source"]);
  assert.deepEqual(first.ruleNames, ["Old rule", "Other rule"]);
  assert.equal(store.matches(1, 25, "café", ["Other rule"], ["Old source"]).total, 0);
});

test("source choices retain historical snapshots and disappear with the last matching record", (t) => {
  const { store, addMatch } = fixture(t);
  assert.deepEqual(store.matches().sourceNames, []);
  const source = store.addSource({ externalId: "1", name: "Old name", kind: "group" }, "0");
  addMatch("a", source.name);
  addMatch("b", source.name);
  store.db.run("UPDATE sources SET name=? WHERE id=?", "New name", source.id);
  addMatch("c", store.source(source.id).name);
  store.removeSource(source.id);

  assert.deepEqual(store.matches().sourceNames, ["New name", "Old name"]);
  assert.equal(store.matches(1, 25, "", [], ["Old name"]).total, 2);
  assert.deepEqual(store.matches(1, 25, "missing").sourceNames, ["New name", "Old name"]);
  store.deleteMatch("a");
  assert.deepEqual(store.matches().sourceNames, ["New name", "Old name"]);
  store.deleteMatch("b");
  assert.deepEqual(store.matches().sourceNames, ["New name"]);
});
