import { beforeEach, describe, expect, it } from "vitest";
import { createSampleWorkspace, normalizeWorkspace } from "./document";
import {
  MAX_AUTO_VERSIONS,
  contentKey,
  createBackup,
  createCV,
  describeChanges,
  loadLibrary,
  loadWorkingCopy,
  memoryVersionStore,
  parseBackup,
  readIndex,
  saveVersion,
  updateIndex
} from "./library";
import type { CVWorkspace } from "./types";

function english(workspace: CVWorkspace) {
  return workspace.languages.find((language) => language.code === "en")!.document;
}

function englishOnly(): CVWorkspace {
  const workspace = createSampleWorkspace();
  workspace.languages.forEach((language) => {
    language.enabled = language.code === "en";
  });
  return workspace;
}

beforeEach(() => {
  localStorage.clear();
});

describe("library storage", () => {
  it("adopts the CV stored by earlier versions of the app as “My CV”", () => {
    const legacy = englishOnly();
    english(legacy).header.name = "Legacy Name";
    localStorage.setItem("cv-forge-workspace-v3", JSON.stringify(legacy));

    const { index, workspace } = loadLibrary();

    expect(index.cvs).toHaveLength(1);
    expect(index.cvs[0].name).toBe("My CV");
    expect(english(workspace).header.name).toBe("Legacy Name");
    expect(loadWorkingCopy(index.activeId)).toEqual(workspace);
    expect(localStorage.getItem("cv-forge-workspace-v3")).toBeNull();
    // A second boot reads the library, not the sample.
    expect(loadLibrary().index.activeId).toBe(index.activeId);
  });

  it("keeps CVs added by another tab when updating the index", () => {
    const { index } = loadLibrary();
    const other = createCV(index, "From another tab", englishOnly());

    // This tab still holds the old index, without the new CV.
    const renamed = updateIndex(index, (draft) => {
      draft.cvs[0].name = "Renamed";
    });

    expect(renamed.cvs.map((cv) => cv.name)).toEqual(["Renamed", "From another tab"]);
    expect(readIndex()?.cvs.map((cv) => cv.id)).toContain(other.meta.id);
  });

  it("falls back to a readable CV when the last-open one is missing", () => {
    const { index } = loadLibrary();
    const second = createCV(index, "Second", englishOnly());
    updateIndex(second.index, (draft) => void (draft.activeId = "cv-gone"));
    localStorage.removeItem(`cv-forge-cv:${index.activeId}`);

    expect(loadLibrary().index.activeId).toBe(second.meta.id);
  });
});

describe("saveVersion", () => {
  it("skips a version identical to the latest one", async () => {
    const store = memoryVersionStore();
    const workspace = englishOnly();

    expect(await saveVersion(store, "cv-1", workspace, "First", "manual", 1000)).not.toBeNull();
    expect(await saveVersion(store, "cv-1", { ...workspace, activeLanguage: "zh" }, "Again", "auto", 2000)).toBeNull();
    expect(await store.list("cv-1")).toHaveLength(1);
  });

  it("promotes an automatic version when the same state is saved by name", async () => {
    const store = memoryVersionStore();
    const workspace = englishOnly();
    await saveVersion(store, "cv-1", workspace, "Autosave", "auto", 1000);

    const promoted = await saveVersion(store, "cv-1", workspace, "Sent to ACME", "manual", 2000);

    expect(promoted).toMatchObject({ label: "Sent to ACME", kind: "manual" });
    expect(await store.list("cv-1")).toHaveLength(1);
  });

  it("prunes old automatic versions but keeps every manual one", async () => {
    const store = memoryVersionStore();
    const workspace = englishOnly();
    await saveVersion(store, "cv-1", workspace, "Keep me", "manual", 0);
    for (let i = 1; i <= MAX_AUTO_VERSIONS + 5; i += 1) {
      english(workspace).header.name = `Name ${i}`;
      await saveVersion(store, "cv-1", workspace, "Autosave", "auto", i * 1000);
    }

    const versions = await store.list("cv-1");
    expect(versions.filter((v) => v.kind === "auto")).toHaveLength(MAX_AUTO_VERSIONS);
    expect(versions.some((v) => v.label === "Keep me")).toBe(true);
    expect(english(versions[0].workspace).header.name).toBe(`Name ${MAX_AUTO_VERSIONS + 5}`);
  });

  it("stores a copy, so later edits do not change the version", async () => {
    const store = memoryVersionStore();
    const workspace = englishOnly();
    await saveVersion(store, "cv-1", workspace, "Before", "manual");
    english(workspace).header.name = "Changed";

    const [version] = await store.list("cv-1");
    expect(english(version.workspace).header.name).not.toBe("Changed");
  });
});

describe("describeChanges", () => {
  it("lists edited, added, removed, hidden and reordered sections", () => {
    const older = englishOnly();
    const newer = structuredClone(older);
    const blocks = english(newer).blocks;
    const [first, second, third] = blocks;

    english(newer).header.name = "New Name";
    if (first.type === "credential") first.entries[0].title = "Changed degree";
    second.hidden = true;
    blocks.splice(blocks.indexOf(third), 1);
    blocks.push({ id: "free-text-new", type: "free-text", title: "Summary", hidden: false, text: "Hello" });
    [blocks[0], blocks[1]] = [blocks[1], blocks[0]];

    expect(describeChanges(older, newer)).toEqual([
      "edited header",
      `hid ${second.title}`,
      `edited ${first.title}`,
      "added Summary",
      `removed ${third.title}`,
      "reordered sections"
    ]);
  });

  it("matches sections by title when ids changed (e.g. after an import)", () => {
    const older = englishOnly();
    const newer = structuredClone(older);
    english(newer).blocks.forEach((block, i) => {
      block.id = `imported-${i}`;
    });

    expect(describeChanges(older, newer)).toEqual([]);
  });

  it("ignores differences that normalization introduces", () => {
    const raw = englishOnly();
    const normalized = normalizeWorkspace(raw)!;

    expect(describeChanges(raw, normalized)).toEqual([]);
    expect(contentKey(raw)).toBe(contentKey(normalized));
  });

  it("prefixes the language when several are enabled", () => {
    const older = createSampleWorkspace();
    const newer = structuredClone(older);
    newer.languages.find((language) => language.code === "ja")!.document.header.name = "新しい名前";
    newer.languages.find((language) => language.code === "zh")!.enabled = false;

    expect(describeChanges(older, newer)).toEqual(["ZH: removed language", "JA: edited header"]);
  });
});

describe("backups", () => {
  it("round-trips CVs with their versions", () => {
    const workspace = normalizeWorkspace(englishOnly())!;
    const text = createBackup([
      {
        name: "Academic",
        createdAt: 1,
        updatedAt: 2,
        workspace,
        versions: [{ label: "v1", kind: "manual", createdAt: 3, workspace }]
      }
    ]);

    const parsed = parseBackup(text);
    expect(parsed).not.toBeTypeOf("string");
    const [cv] = parsed as Exclude<typeof parsed, string>;
    expect(cv.name).toBe("Academic");
    expect(cv.workspace).toEqual(workspace);
    expect(cv.versions).toEqual([{ label: "v1", kind: "manual", createdAt: 3, workspace }]);
  });

  it("rejects files that are not backups", () => {
    expect(parseBackup("{")).toMatch(/not valid JSON/);
    expect(parseBackup(JSON.stringify({ languages: {} }))).toMatch(/not a CV Forge backup/);
  });
});
