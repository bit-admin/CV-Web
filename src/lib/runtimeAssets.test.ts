// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_CACHE,
  RUNTIME_MANIFEST_URL,
  cacheKey,
  formatDownload,
  prepareRuntimeAssets,
  readRuntimeAsset,
  resetRuntimeManifest,
  type DownloadProgress,
  type RuntimeManifest
} from "./runtimeAssets";

const ORIGIN = "http://localhost";

/** Cache Storage kept in memory, keyed by absolute URL. */
function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    const key = (request: RequestInfo | URL) => new URL(request instanceof Request ? request.url : String(request), ORIGIN).href;
    return {
      match: async (request: RequestInfo | URL) => store.get(key(request))?.clone(),
      put: async (request: RequestInfo | URL, response: Response) => void store.set(key(request), response),
      delete: async (request: RequestInfo | URL) => store.delete(key(request)),
      keys: async () => [...store.keys()].map((url) => new Request(url))
    };
  };
  return { stores, api: { open } };
}

const wasm = new Uint8Array(4000).map((_, index) => index % 7);
const wasmGzip = new Uint8Array(
  await new Response(new Blob([wasm]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()
);
const style = new TextEncoder().encode("\\ProvidesPackage{x}");

const manifest: RuntimeManifest = {
  files: {
    "/core/busytex/busytex.wasm": {
      size: wasm.length,
      hash: "aaa",
      parts: [
        { url: "/core/packs/busytex.wasm.aaa.000.bin", size: 100 },
        { url: "/core/packs/busytex.wasm.aaa.001.bin", size: wasmGzip.length - 100 }
      ]
    },
    "/core/texmf/x.sty": { size: style.length, hash: "bbb" }
  }
};

const hosted: Record<string, BlobPart> = {
  [RUNTIME_MANIFEST_URL]: JSON.stringify(manifest),
  "/core/packs/busytex.wasm.aaa.000.bin": wasmGzip.subarray(0, 100),
  "/core/packs/busytex.wasm.aaa.001.bin": wasmGzip.subarray(100),
  "/core/texmf/x.sty?v=bbb": style
};

let caches: ReturnType<typeof memoryCaches>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetRuntimeManifest();
  caches = memoryCaches();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const body = hosted[String(input)];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(new Blob([body]));
  });
  vi.stubGlobal("caches", caches.api);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime assets", () => {
  it("downloads, unpacks and caches missing files, reporting progress in transferred bytes", async () => {
    const progress: DownloadProgress[] = [];
    await prepareRuntimeAssets(["/core/busytex/busytex.wasm", "/core/texmf/x.sty"], (value) => progress.push(value));

    const total = wasmGzip.length + style.length;
    expect(progress[0]).toEqual({ loaded: 0, total });
    expect(progress.at(-1)).toEqual({ loaded: total, total });

    const store = caches.stores.get(RUNTIME_CACHE)!;
    const cachedWasm = store.get(`${ORIGIN}${cacheKey("/core/busytex/busytex.wasm", manifest.files["/core/busytex/busytex.wasm"])}`)!;
    expect(cachedWasm.headers.get("Content-Type")).toBe("application/wasm");
    expect(new Uint8Array(await cachedWasm.arrayBuffer())).toEqual(wasm);
    expect(await readRuntimeAsset("/core/texmf/x.sty")).toEqual(style);
  });

  it("reports nothing and fetches only the manifest when everything is cached", async () => {
    await prepareRuntimeAssets(["/core/texmf/x.sty"]);
    fetchMock.mockClear();
    resetRuntimeManifest();

    const onProgress = vi.fn();
    await prepareRuntimeAssets(["/core/texmf/x.sty"], onProgress);
    expect(onProgress).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([RUNTIME_MANIFEST_URL]);
  });

  it("rejects a file the manifest does not list", async () => {
    await expect(prepareRuntimeAssets(["/core/texmf/missing.sty"])).rejects.toThrow(/missing from the runtime manifest/);
  });

  it("formats progress for the status bar", () => {
    expect(formatDownload({ loaded: 33 * 1024 * 1024, total: 79 * 1024 * 1024 })).toBe("41% · 33 / 79 MB");
    expect(formatDownload({ loaded: 0, total: 0 })).toBe("0% · 0 / 0 MB");
  });
});
