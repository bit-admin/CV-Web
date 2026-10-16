// Downloads the TeX engine, TeX files and fonts into Cache Storage, reporting progress.
//
// `scripts/build-runtime-assets.mjs` lists every runtime file in the manifest with its size and content hash; large
// binaries are hosted as gzipped parts. Each file is cached, decompressed, under `<url>?v=<hash>`, and
// `public/service-worker.js` answers requests for the plain URL from that entry. Keep the cache name, manifest URL
// and key format in sync with the service worker.

export const RUNTIME_MANIFEST_URL = "/core/runtime-manifest.json";
export const RUNTIME_CACHE = "cv-forge-runtime";

export type RuntimePart = { url: string; size: number };
/** A runtime file; `parts` are the gzipped file split into pieces, when it is hosted that way. */
export type RuntimeFile = { size: number; hash: string; parts?: RuntimePart[] };
export type RuntimeManifest = { files: Record<string, RuntimeFile> };
export type DownloadGroupProgress = { group: string; loaded: number; total: number };
/** Bytes downloaded of the total, overall and per group (see `prepareRuntimeAssets`), in first-seen order. */
export type DownloadProgress = { loaded: number; total: number; groups: DownloadGroupProgress[] };

const DOWNLOAD_CONCURRENCY = 6;
const PROGRESS_INTERVAL_MS = 100;

export function cacheKey(url: string, file: RuntimeFile): string {
  return `${url}?v=${file.hash}`;
}

/** Bytes fetched to download a file: the compressed parts, or the file itself. */
export function transferSize(file: RuntimeFile): number {
  return file.parts ? file.parts.reduce((sum, part) => sum + part.size, 0) : file.size;
}

export function formatDownload({ loaded, total }: Pick<DownloadProgress, "loaded" | "total">): string {
  const percent = total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(0);
  return `${percent}% · ${mb(loaded)} / ${mb(total)} MB`;
}

/** "0.4 MB", "7.8 MB", "96 MB": one decimal below 10 MB. */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** "about 40 s left", "about 3 min left"; null while the rate is unknown. */
export function formatTimeLeft(remainingBytes: number, bytesPerSecond: number | null): string | null {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 5) return "a few seconds left";
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} s left`;
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} min left`;
  return `about ${(seconds / 3600).toFixed(1)} h left`;
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
  if (!file) throw new Error(`${url} is missing from the runtime manifest; run npm run assets:build.`);
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

/** One download: a gzipped part, or a whole file that is hosted unpacked. Each is cached as soon as it arrives. */
type Download = { source: string; size: number; contentType: string; group: DownloadGroupProgress };

async function download(cache: Cache, item: Download, onBytes: (bytes: number) => void): Promise<void> {
  let received = 0;
  let chunks: Uint8Array[];
  try {
    chunks = await readBody(item.source, (bytes) => ((received += bytes), onBytes(bytes)));
  } catch {
    // One retry for a dropped connection; progress restarts for this download.
    onBytes(-received);
    chunks = await readBody(item.source, onBytes);
  }
  const body = new Blob(chunks as BlobPart[]);
  await cache.put(
    item.source,
    new Response(body, { headers: { "Content-Type": item.contentType, "Content-Length": String(body.size) } })
  );
}

/** Joins and unpacks a file whose parts are all cached, then drops the parts. */
async function assemble(cache: Cache, url: string, file: RuntimeFile & { parts: RuntimePart[] }): Promise<void> {
  const parts = await Promise.all(
    file.parts.map(async (part) => {
      const response = await cache.match(part.url);
      if (!response) throw new Error(`Missing downloaded part ${part.url}.`);
      return response.blob();
    })
  );
  const body = await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"))).blob();
  if (body.size !== file.size) {
    await Promise.all(file.parts.map((part) => cache.delete(part.url)));
    throw new Error(`Downloaded ${url} has ${body.size} bytes, expected ${file.size}.`);
  }
  await cache.put(
    cacheKey(url, file),
    new Response(body, { headers: { "Content-Type": contentType(url), "Content-Length": String(body.size) } })
  );
  await Promise.all(file.parts.map((part) => cache.delete(part.url)));
}

/** Removes cached files and parts that the current manifest no longer lists. */
async function pruneRuntimeCache(cache: Cache, manifest: RuntimeManifest): Promise<void> {
  const parts = new Set(Object.values(manifest.files).flatMap((file) => (file.parts ?? []).map((part) => part.url)));
  const keys = await cache.keys();
  await Promise.all(
    keys.map((request) => {
      const url = new URL(request.url);
      if (url.pathname === RUNTIME_MANIFEST_URL || parts.has(url.pathname)) return undefined;
      const file = manifest.files[url.pathname];
      return file && url.searchParams.get("v") === file.hash ? undefined : cache.delete(request);
    })
  );
}

let pruned = false;

/**
 * Makes sure every URL is in the runtime cache, downloading what is missing. Parts already cached by an
 * interrupted earlier visit are kept and count as downloaded. `onProgress` is called only when something needs
 * downloading, so a warm start reports nothing.
 */
export async function prepareRuntimeAssets(
  urls: string[],
  onProgress?: (progress: DownloadProgress) => void,
  groupOf: (url: string) => string = () => "files"
): Promise<void> {
  if (!hasCacheStorage()) return;
  const manifest = await loadRuntimeManifest();
  const cache = await caches.open(RUNTIME_CACHE);
  if (!pruned) {
    pruned = true;
    await pruneRuntimeCache(cache, manifest);
    // BusyTeX's own package loader kept a second copy of its TeX Live data (~90 MB) here; ours does not use it.
    try {
      if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("EM_PRELOAD_CACHE");
    } catch {
      // Storage may be blocked; nothing to clean up then.
    }
  }

  const packed: [string, RuntimeFile & { parts: RuntimePart[] }][] = [];
  const downloads: Download[] = [];
  const progress = { loaded: 0, total: 0 };
  const groups = new Map<string, DownloadGroupProgress>();
  for (const url of new Set(urls)) {
    const file = manifestEntry(manifest, url);
    if (await cache.match(cacheKey(url, file))) continue;
    const name = groupOf(url);
    const group = groups.get(name) ?? { group: name, loaded: 0, total: 0 };
    groups.set(name, group);
    progress.total += transferSize(file);
    group.total += transferSize(file);
    if (!file.parts) {
      // The versioned URL bypasses the service worker and any stale HTTP cache entry; the host ignores the query.
      downloads.push({ source: cacheKey(url, file), size: file.size, contentType: contentType(url), group });
      continue;
    }
    packed.push([url, { ...file, parts: file.parts }]);
    for (const part of file.parts) {
      if (await cache.match(part.url)) {
        progress.loaded += part.size;
        group.loaded += part.size;
      } else {
        downloads.push({ source: part.url, size: part.size, contentType: "application/octet-stream", group });
      }
    }
  }
  if (progress.total === 0) return;

  let reportedAt = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - reportedAt < PROGRESS_INTERVAL_MS) return;
    reportedAt = now;
    onProgress?.({ ...progress, groups: [...groups.values()].map((group) => ({ ...group })) });
  };
  report(true);

  // A few downloads at a time: browsers share one HTTP/2 connection per host, so more at once is no faster, and
  // each one only counts once it completes — a reload loses whatever is still in flight.
  const queue = [...downloads];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { group } = next;
      await download(cache, next, (bytes) => {
        progress.loaded += bytes;
        group.loaded += bytes;
        report();
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, worker));
  report(true);

  for (const [url, file] of packed) {
    await assemble(cache, url, file);
  }
}

/** Bytes `prepareRuntimeAssets` would download for these URLs now; 0 when they are cached or unknown. */
export async function pendingDownloadSize(urls: string[]): Promise<number> {
  if (!hasCacheStorage()) return 0;
  try {
    const manifest = await loadRuntimeManifest();
    const cache = await caches.open(RUNTIME_CACHE);
    let total = 0;
    for (const url of new Set(urls)) {
      const file = manifest.files[url];
      if (!file || (await cache.match(cacheKey(url, file)))) continue;
      for (const part of file.parts ?? [{ url: cacheKey(url, file), size: file.size }]) {
        if (!(await cache.match(part.url))) total += part.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
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
