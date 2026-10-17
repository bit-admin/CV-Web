import { describe, expect, it } from "vitest";
import { memorySql } from "../../worker/sqlite.testing";
import { SyncError, SyncStore } from "../../worker/store";
import { createSampleWorkspace } from "./document";
import {
  EMPTY_SYNC_STATE,
  decide,
  payloadHash,
  runSync,
  untouchedStarterCV,
  type CVPayload,
  type SyncCipher,
  type SyncLocal,
  type SyncPayload,
  type SyncState,
  type SyncTransport,
  type VersionPayload
} from "./sync";
import { decryptItem, deriveSyncKeys, encryptItem, generateSyncCode, parseSyncCode } from "./syncCrypto";

function cv(name: string, summary = ""): CVPayload {
  const workspace = createSampleWorkspace();
  workspace.languages[0].document.header.name = summary || name;
  return { type: "cv", name, createdAt: 1, updatedAt: 1, workspace };
}

function version(cvId: string, label: string, from: CVPayload): VersionPayload {
  return { type: "version", cvId, label, kind: "manual", createdAt: 2, workspace: structuredClone(from.workspace) };
}

/** A browser's library, reduced to what sync needs. */
class Device implements SyncLocal {
  items = new Map<string, SyncPayload>();
  state: SyncState = { ...EMPTY_SYNC_STATE, code: "x" };
  private counter = 0;

  constructor(
    private readonly name: string,
    private readonly transport: SyncTransport
  ) {}

  async snapshot() {
    return new Map([...this.items].map(([id, payload]) => [id, structuredClone(payload)]));
  }

  async apply(changes: Array<{ id: string; payload: SyncPayload | null }>) {
    const refused = new Set<string>();
    for (const { id, payload } of changes) {
      if (payload) this.items.set(id, structuredClone(payload));
      else if (id.startsWith("cv:") && [...this.items.keys()].filter((key) => key.startsWith("cv:")).length <= 1) refused.add(id);
      else this.items.delete(id);
    }
    return refused;
  }

  async keepConflictCopy(cvId: string, local: CVPayload) {
    this.counter += 1;
    this.items.set(`v:${this.name}-conflict-${this.counter}`, {
      type: "version",
      cvId,
      label: "Conflict copy",
      kind: "manual",
      createdAt: 3,
      workspace: local.workspace
    });
  }

  async sync(create = false) {
    const result = await runSync({ state: this.state, local: this, transport: this.transport, cipher: plainCipher, create, save: () => undefined });
    this.state = result.state;
    return result.stats;
  }

  content() {
    return Object.fromEntries([...this.items].map(([id, payload]) => [id, payloadHash(payload)]));
  }
}

const plainCipher: SyncCipher = {
  async encrypt(id, payload) {
    return JSON.stringify({ id, payload });
  },
  async decrypt(id, blob) {
    const parsed = JSON.parse(blob) as { id: string; payload: SyncPayload };
    expect(parsed.id).toBe(id);
    return parsed.payload;
  }
};

async function setup() {
  const store = new SyncStore(await memorySql());
  const transport: SyncTransport = {
    async sync(request) {
      // Through JSON, as over the network.
      return JSON.parse(JSON.stringify(store.sync("auth", JSON.parse(JSON.stringify(request)))));
    }
  };
  return { store, a: new Device("a", transport), b: new Device("b", transport) };
}

describe("sync code", () => {
  it("round-trips through typing mistakes and derives stable keys", async () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(parseSyncCode(` ${code.toLowerCase().replace(/-/g, " ")} `)).toBe(code);
    expect(parseSyncCode(code.replace(/0/g, "O").replace(/1/g, "l"))).toBe(code);
    expect(parseSyncCode("not a code")).toBeNull();
    expect(parseSyncCode(code.slice(0, -1))).toBeNull();

    const first = await deriveSyncKeys(code);
    const second = await deriveSyncKeys(code.toLowerCase());
    expect(first.syncId).toMatch(/^[0-9a-f]{32}$/);
    expect(second.syncId).toBe(first.syncId);
    expect(second.token).toBe(first.token);
    expect(first.token).not.toContain(first.syncId);
  });

  it("encrypts items so that only the same code and item id can read them", async () => {
    const keys = await deriveSyncKeys(generateSyncCode());
    const payload = cv("Résumé – 履歷");
    const blob = await encryptItem(keys.key, "cv:a", payload);
    expect(blob).not.toContain("sum");
    expect(await decryptItem(keys.key, "cv:a", blob)).toEqual(payload);
    await expect(decryptItem(keys.key, "cv:b", blob)).rejects.toThrow();
    await expect(decryptItem((await deriveSyncKeys(generateSyncCode())).key, "cv:a", blob)).rejects.toThrow();
  });
});

describe("decide", () => {
  const one = cv("One");
  const two = cv("Two");
  const base = { seq: 1, hash: payloadHash(one) };

  it("lets the only side that changed win", () => {
    expect(decide(one, two, base).action).toBe("apply");
    expect(decide(undefined, one, undefined).action).toBe("apply");
    expect(decide(one, null, base).action).toBe("apply");
  });

  it("prefers edits over deletions and reports edits on both sides as a conflict", () => {
    const three = cv("Three");
    expect(decide(two, null, base)).toEqual({ action: "keep-local" });
    expect(decide(undefined, two, base).action).toBe("apply");
    expect(decide(two, three, base).action).toBe("conflict");
    expect(decide(two, structuredClone(two), base).action).toBe("agree");
  });
});

describe("runSync", () => {
  it("copies a library to a second device and keeps both in step", async () => {
    const { a, b } = await setup();
    const mine = cv("Mine");
    a.items.set("cv:1", mine);
    a.items.set("v:1", version("1", "Sent to ACME", mine));
    expect(await a.sync(true)).toEqual({ sent: 2, received: 0, conflicts: 0 });

    b.items.set("cv:2", cv("Fresh device"));
    await b.sync();
    expect(Object.keys(b.content()).sort()).toEqual(["cv:1", "cv:2", "v:1"]);
    await a.sync();
    expect(a.content()).toEqual(b.content());

    // An edit and a deletion travel; an unchanged library sends nothing.
    a.items.set("cv:1", cv("Mine", "New headline"));
    b.items.delete("cv:2");
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.content()).toEqual(b.content());
    expect(Object.keys(a.content()).sort()).toEqual(["cv:1", "v:1"]);
    expect(await a.sync()).toEqual({ sent: 0, received: 0, conflicts: 0 });
  });

  it("keeps the losing side of a conflict as a version", async () => {
    const { a, b } = await setup();
    a.items.set("cv:1", cv("Mine"));
    await a.sync(true);
    await b.sync();

    a.items.set("cv:1", cv("Mine", "Edited on A"));
    b.items.set("cv:1", cv("Mine", "Edited on B"));
    await a.sync();
    const stats = await b.sync();
    expect(stats.conflicts).toBe(1);
    // B now shows A's edit, and keeps its own as a version that A also receives.
    expect(b.items.get("cv:1")).toEqual(a.items.get("cv:1"));
    const copy = [...b.items.values()].find((item) => item.type === "version") as VersionPayload;
    expect(copy.workspace.languages[0].document.header.name).toBe("Edited on B");
    await a.sync();
    expect(a.content()).toEqual(b.content());
  });

  it("brings back a CV deleted on one device but edited on the other", async () => {
    const { a, b } = await setup();
    a.items.set("cv:1", cv("Keep"));
    a.items.set("cv:2", cv("Edit me"));
    await a.sync(true);
    await b.sync();

    a.items.delete("cv:2");
    await a.sync();
    b.items.set("cv:2", cv("Edit me", "Edited after the delete"));
    await b.sync();
    await a.sync();
    expect(a.items.get("cv:2")?.workspace.languages[0].document.header.name).toBe("Edited after the delete");
    expect(a.content()).toEqual(b.content());
  });

  it("puts back a CV a device could not delete", async () => {
    const { a, b } = await setup();
    a.items.set("cv:1", cv("Only"));
    await a.sync(true);
    await b.sync();

    // B refuses the deletion, as the app does for its last CV, and restores it for everyone.
    const apply = b.apply.bind(b);
    b.apply = async (changes) => {
      await apply(changes.filter((change) => change.payload));
      return new Set(changes.filter((change) => !change.payload).map((change) => change.id));
    };
    a.items.set("cv:2", cv("Replacement"));
    a.items.delete("cv:1");
    await a.sync();
    await b.sync();
    expect(b.items.has("cv:1")).toBe(true);
    await a.sync();
    expect(a.items.has("cv:1")).toBe(true);
  });

  it("can leave items out, such as a new browser's untouched sample CV", async () => {
    const { a, b } = await setup();
    a.items.set("cv:1", cv("Mine"));
    await a.sync(true);
    const sample: CVPayload = { type: "cv", name: "My CV", createdAt: 5, updatedAt: 5, workspace: createSampleWorkspace() };
    b.items.set("cv:starter", sample);
    expect(untouchedStarterCV(await b.snapshot())).toBe("cv:starter");
    expect(untouchedStarterCV(await a.snapshot())).toBeNull();

    const result = await runSync({ state: b.state, local: b, transport: b["transport"], cipher: plainCipher, skip: new Set(["cv:starter"]), save: () => undefined });
    await b.apply([{ id: "cv:starter", payload: null }]);
    b.state = result.state;
    expect([...b.items.keys()]).toEqual(["cv:1"]);
    expect(await b.sync()).toEqual({ sent: 0, received: 0, conflicts: 0 });
  });

  it("refuses an unknown code instead of creating a space", async () => {
    const { a } = await setup();
    await expect(a.sync(false)).rejects.toBeInstanceOf(SyncError);
  });
});
