// Downloads the TeX engine, TeX files and fonts into Cache Storage, reporting progress.
//
// `scripts/split-runtime-assets.mjs` lists every runtime file in the manifest with its size and content hash; large
// binaries are hosted as gzipped parts. Each file is cached, decompressed, under `<url>?v=<hash>`, and
// `public/service-worker.js` answers requests for the plain URL from that entry. Keep the cache name, manifest URL
// and key format in sync with the service worker.

export const RUNTIME_MANIFEST_URL = "/core/runtime-manifest.json";
export const RUNTIME_CACHE = "cv-forge-runtime";

export type RuntimePart = { url: string; size: number };
/** A runtime file; `parts` are the gzipped file split into pieces, when it is hosted that way. */
export type RuntimeFile = { size: number; hash: string; parts?: RuntimePart[] };
export type RuntimeManifest = { files: Record<string, RuntimeFile> };
export type DownloadProgress = { loaded: number; total: number };

const DOWNLOAD_CONCURRENCY = 4;
const PROGRESS_INTERVAL_MS = 100;

export function cacheKey(url: string, file: RuntimeFile): string {
  return `${url}?v=${file.hash}`;
}

/** Bytes fetched to download a file: the compressed parts, or the file itself. */
export function transferSize(file: RuntimeFile): number {
  return file.parts ? file.parts.reduce((sum, part) => sum + part.size, 0) : file.size;
}

export function formatDownload({ loaded, total }: DownloadProgress): string {
  const percent = total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(0);
  return `${percent}% · ${mb(loaded)} / ${mb(total)} MB`;
}

function contentType(url: string): string {
  if (url.endsWith(".wasm")) return "application/wasm";
  if (url.endsWith(".js")) return "text/javascript";
  return "application/octet-stream";
}

function hasCacheStorage(): boolean {
  return typeof caches !== "undefined";
}

let manifestPromise: Promise<RuntimeManifest> | null = null;

/** The current manifest from the network, or the last cached copy when offline. */
export function loadRuntimeManifest(): Promise<RuntimeManifest> {
  manifestPromise ??= (async () => {
    const cache = hasCacheStorage() ? await caches.open(RUNTIME_CACHE) : null;
    try {
      const response = await fetch(RUNTIME_MANIFEST_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await cache?.put(RUNTIME_MANIFEST_URL, response.clone());
      return (await response.json()) as RuntimeManifest;
    } catch (error) {
      const cached = await cache?.match(RUNTIME_MANIFEST_URL);
      if (cached) return (await cached.json()) as RuntimeManifest;
      throw new Error(`Unable to load the TeX engine manifest (${error instanceof Error ? error.message : String(error)}).`);
    }
  })().catch((error) => {
    manifestPromise = null;
    throw error;
  });
  return manifestPromise;
}

/** Test hook: forget the manifest loaded by an earlier call. */
export function resetRuntimeManifest(): void {
  manifestPromise = null;
}

function manifestEntry(manifest: RuntimeManifest, url: string): RuntimeFile {
  const file = manifest.files[url];
  if (!file) throw new Error(`${url} is missing from the runtime manifest; run npm run assets:split.`);
  return file;
}

async function readBody(url: string, onBytes: (bytes: number) => void): Promise<Uint8Array[]> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Unable to download ${url} (HTTP ${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
    onBytes(value.byteLength);
  }
}

async function downloadFile(cache: Cache, url: string, file: RuntimeFile, onBytes: (bytes: number) => void): Promise<void> {
  // The versioned URL bypasses the service worker and any stale HTTP cache entry; the host ignores the query.
  const sources = file.parts?.map((part) => part.url) ?? [cacheKey(url, file)];
  const chunks: Uint8Array[] = [];
  for (const source of sources) {
    let received = 0;
    try {
      chunks.push(...(await readBody(source, (bytes) => ((received += bytes), onBytes(bytes)))));
    } catch {
      // One retry for a dropped connection; progress restarts for this part.
      onBytes(-received);
      chunks.push(...(await readBody(source, onBytes)));
    }
  }

  let body = new Blob(chunks as BlobPart[]);
  if (file.parts) {
    body = await new Response(body.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
  }
  if (body.size !== file.size) {
    throw new Error(`Downloaded ${url} has ${body.size} bytes, expected ${file.size}.`);
  }
  await cache.put(
    cacheKey(url, file),
    new Response(body, { headers: { "Content-Type": contentType(url), "Content-Length": String(body.size) } })
  );
}

/** Removes cached runtime files that the current manifest no longer lists at the same version. */
async function pruneRuntimeCache(cache: Cache, manifest: RuntimeManifest): Promise<void> {
  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      const url = new URL(request.url);
      if (url.pathname === RUNTIME_MANIFEST_URL) return undefined;
      const file = manifest.files[url.pathname];
      return file && url.searchParams.get("v") === file.hash ? undefined : cache.delete(request);
    })
  );
}

let pruned = false;

/**
 * Makes sure every URL is in the runtime cache, downloading what is missing. `onProgress` is called only when
 * something needs downloading, so a warm start reports nothing.
 */
export async function prepareRuntimeAssets(urls: string[], onProgress?: (progress: DownloadProgress) => void): Promise<void> {
  if (!hasCacheStorage()) return;
  const manifest = await loadRuntimeManifest();
  const cache = await caches.open(RUNTIME_CACHE);
  if (!pruned) {
    pruned = true;
    await pruneRuntimeCache(cache, manifest);
  }

  const missing: [string, RuntimeFile][] = [];
  for (const url of new Set(urls)) {
    const file = manifestEntry(manifest, url);
    if (!(await cache.match(cacheKey(url, file)))) missing.push([url, file]);
  }
  if (missing.length === 0) return;

  const progress = { loaded: 0, total: missing.reduce((sum, [, file]) => sum + transferSize(file), 0) };
  let reportedAt = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - reportedAt < PROGRESS_INTERVAL_MS) return;
    reportedAt = now;
    onProgress?.({ ...progress });
  };
  report(true);

  // Largest first, so the long downloads overlap instead of one finishing last on its own.
  const queue = [...missing].sort(([, a], [, b]) => transferSize(b) - transferSize(a));
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [url, file] = next;
      await downloadFile(cache, url, file, (bytes) => {
        progress.loaded += bytes;
        report();
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, worker));
  report(true);
}

/** A runtime file's bytes, from the runtime cache when present. */
export async function readRuntimeAsset(url: string): Promise<Uint8Array> {
  if (hasCacheStorage()) {
    const manifest = await loadRuntimeManifest().catch(() => null);
    const file = manifest?.files[url];
    const cached = file ? await (await caches.open(RUNTIME_CACHE)).match(cacheKey(url, file)) : undefined;
    if (cached) return new Uint8Array(await cached.arrayBuffer());
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Missing runtime asset ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
