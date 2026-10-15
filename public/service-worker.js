// Bump SHELL_CACHE on each deploy so the app shell updates. Runtime files (TeX engine, TeX files, fonts) live in
// RUNTIME_CACHE under versioned keys written by src/lib/runtimeAssets.ts, so a deploy does not re-download them.
// Keep RUNTIME_CACHE, RUNTIME_MANIFEST_URL and the `<url>?v=<hash>` key format in sync with that module.
const SHELL_CACHE = "cv-forge-shell-v23";
const RUNTIME_CACHE = "cv-forge-runtime";
const RUNTIME_MANIFEST_URL = "/core/runtime-manifest.json";
const RUNTIME_PREFIXES = ["/core/", "/fonts/"];

let manifestPromise = null;

async function fetchManifest() {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(RUNTIME_MANIFEST_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(RUNTIME_MANIFEST_URL, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(RUNTIME_MANIFEST_URL);
    if (cached) return cached;
    throw error;
  }
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchManifest()
      .then((response) => response.json())
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

// The page fetches the manifest before every download; refresh our copy at the same time.
async function manifestResponse() {
  const response = await fetchManifest();
  manifestPromise = response.clone().json();
  return response;
}

function contentType(pathname) {
  if (pathname.endsWith(".wasm")) return "application/wasm";
  if (pathname.endsWith(".js")) return "text/javascript";
  return "application/octet-stream";
}

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to fetch ${url} (HTTP ${response.status})`);
  return response;
}

/** Serves a runtime file from the cache, downloading it first if the page has not. */
async function runtimeResponse(request, pathname) {
  const manifest = await loadManifest().catch(() => null);
  const file = manifest?.files[pathname];
  if (!file) return fetch(request);

  const key = `${pathname}?v=${file.hash}`;
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(key);
  if (cached) return cached;

  let body;
  if (file.parts) {
    const parts = [];
    for (const part of file.parts) parts.push(await (await fetchOk(part.url)).blob());
    body = await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"))).blob();
  } else {
    body = await (await fetchOk(key)).blob();
  }
  const response = new Response(body, {
    headers: { "Content-Type": contentType(pathname), "Content-Length": String(body.size) }
  });
  await cache.put(key, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add("/"))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("cv-forge-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === RUNTIME_MANIFEST_URL) {
    event.respondWith(manifestResponse());
    return;
  }

  if (RUNTIME_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    // Versioned URLs and packed parts are downloads by the page itself: pass them through uncached.
    if (!url.search && !url.pathname.startsWith("/core/packs/")) {
      event.respondWith(runtimeResponse(request, url.pathname));
    }
    return;
  }

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached && request.cache !== "reload" && request.cache !== "no-store") {
        return cached;
      }

      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
  );
});
