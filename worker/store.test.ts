// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_SPACE_CHARS, PAGE_CHARS } from "../src/lib/syncProtocol";
import { memorySql } from "./sqlite.testing";
import { SyncError, SyncStore, TOMBSTONE_MS } from "./store";

async function open(now = () => 1_000) {
  return new SyncStore(await memorySql(), now);
}

function rejects(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).status).toBe(status);
    return;
  }
  throw new Error("expected a SyncError");
}

describe("SyncStore", () => {
  it("creates a space only when asked, then checks the code on every request", async () => {
    const store = await open();
    rejects(() => store.sync("hash", { since: 0, items: [] }), 404);
    expect(store.sync("hash", { since: 0, create: true, items: [] })).toEqual({ seq: 0, accepted: [], conflicts: [], changes: [] });
    rejects(() => store.sync("other", { since: 0, items: [] }), 403);
    expect(store.sync("hash", { since: 0, items: [] }).seq).toBe(0);
  });

  it("writes items with compare-and-swap and reports what others changed", async () => {
    const store = await open();
    const first = store.sync("h", { since: 0, create: true, items: [{ id: "cv:a", baseSeq: 0, deleted: false, blob: "A1" }] });
    expect(first).toMatchObject({ seq: 1, accepted: [{ id: "cv:a", seq: 1 }], changes: [] });

    // Another device, still at seq 0, edits the same CV: rejected with the current state.
    const stale = store.sync("h", { since: 0, items: [{ id: "cv:a", baseSeq: 0, deleted: false, blob: "B1" }] });
    expect(stale.accepted).toEqual([]);
    expect(stale.conflicts).toEqual([{ id: "cv:a", seq: 1, deleted: false, blob: "A1" }]);
    expect(stale.changes).toEqual([{ id: "cv:a", seq: 1, deleted: false, blob: "A1" }]);

    const update = store.sync("h", { since: 1, items: [{ id: "cv:a", baseSeq: 1, deleted: false, blob: "B2" }, { id: "v:x", baseSeq: 0, deleted: false, blob: "V" }] });
    expect(update).toMatchObject({ seq: 3, accepted: [{ id: "cv:a", seq: 2 }, { id: "v:x", seq: 3 }], changes: [] });

    const pull = store.sync("h", { since: 1, items: [] });
    expect(pull.changes.map((item) => [item.id, item.seq, item.blob])).toEqual([["cv:a", 2, "B2"], ["v:x", 3, "V"]]);
  });

  it("keeps deletions as tombstones, but not for items the server never had", async () => {
    const store = await open();
    store.sync("h", { since: 0, create: true, items: [{ id: "v:x", baseSeq: 0, deleted: false, blob: "V" }] });
    expect(store.sync("h", { since: 1, items: [{ id: "v:y", baseSeq: 0, deleted: true }] }).accepted).toEqual([{ id: "v:y", seq: 0 }]);
    expect(store.sync("h", { since: 1, items: [{ id: "v:x", baseSeq: 1, deleted: true }] }).accepted).toEqual([{ id: "v:x", seq: 2 }]);
    expect(store.sync("h", { since: 1, items: [] }).changes).toEqual([{ id: "v:x", seq: 2, deleted: true }]);
    // A fresh device does not need to hear about deletions.
    expect(store.sync("h", { since: 0, items: [] }).changes).toEqual([]);
  });

  it("forgets old deletions and sends clients that synced before them every live item", async () => {
    let now = 1_000;
    const store = await open(() => now);
    store.sync("h", { since: 0, create: true, items: [{ id: "v:x", baseSeq: 0, deleted: false, blob: "V" }, { id: "cv:a", baseSeq: 0, deleted: false, blob: "A" }] });
    store.sync("h", { since: 2, items: [{ id: "v:x", baseSeq: 1, deleted: true }] });
    now += TOMBSTONE_MS + 1;
    const response = store.sync("h", { since: 1, items: [] });
    expect(response.reset).toBe(true);
    expect(response.changes).toEqual([{ id: "cv:a", seq: 2, deleted: false, blob: "A" }]);
    // Up-to-date clients are unaffected.
    expect(store.sync("h", { since: 3, items: [] })).toMatchObject({ changes: [] });
    expect(store.sync("h", { since: 3, items: [] }).reset).toBeUndefined();
  });

  it("pages large pulls", async () => {
    const store = await open();
    const blob = "x".repeat(Math.ceil(PAGE_CHARS / 3));
    store.sync("h", { since: 0, create: true, items: ["a", "b", "c", "d"].map((id) => ({ id: `cv:${id}`, baseSeq: 0, deleted: false, blob })) });
    const first = store.sync("h", { since: 0, items: [] });
    expect(first).toMatchObject({ seq: 3, more: true });
    expect(first.changes.map((item) => item.id)).toEqual(["cv:a", "cv:b", "cv:c"]);
    const second = store.sync("h", { since: first.seq, items: [] });
    expect(second).toMatchObject({ seq: 4 });
    expect(second.more).toBeUndefined();
    expect(second.changes.map((item) => item.id)).toEqual(["cv:d"]);
  });

  it("refuses to go over the space quota and rolls the whole request back", async () => {
    const store = await open();
    const blob = "x".repeat(1_000_000);
    const items = Array.from({ length: MAX_SPACE_CHARS / blob.length }, (_, i) => ({ id: `v:${i}`, baseSeq: 0, deleted: false, blob }));
    store.sync("h", { since: 0, create: true, items });
    rejects(() => store.sync("h", { since: 0, items: [{ id: "cv:a", baseSeq: 0, deleted: false, blob: "A" }, { id: "v:extra", baseSeq: 0, deleted: false, blob }] }), 413);
    expect(store.sync("h", { since: items.length, items: [] }).changes).toEqual([]);
    // Deleting frees room.
    store.sync("h", { since: items.length, items: [{ id: "v:0", baseSeq: 1, deleted: true }] });
    expect(store.sync("h", { since: 0, items: [{ id: "v:extra", baseSeq: 0, deleted: false, blob }] }).accepted).toHaveLength(1);
  });

  it("rejects malformed requests", async () => {
    const store = await open();
    rejects(() => store.sync("h", { since: -1, create: true, items: [] }), 400);
    rejects(() => store.sync("h", { since: 0, create: true, items: [{ id: "index", baseSeq: 0, deleted: false, blob: "x" }] }), 400);
    rejects(() => store.sync("h", { since: 0, create: true, items: [{ id: "cv:a", baseSeq: 0, deleted: false }] }), 400);
    rejects(() => store.sync("h", { since: 0, create: true, items: [{ id: "cv:a", baseSeq: 0, deleted: true }, { id: "cv:a", baseSeq: 0, deleted: true }] }), 400);
    // Nothing was created by the rejected requests.
    rejects(() => store.sync("h", { since: 0, items: [] }), 404);
  });
});
