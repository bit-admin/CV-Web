const CACHE_NAME = "cv-forge-v22";
const CHUNK_MANIFEST_URL = "/core/busytex/chunks/manifest.json";
const CORE_ASSETS = [
  "/",
  "/core/busytex/busytex.js",
  "/core/busytex/busytex_pipeline.js",
  "/core/busytex/busytex_worker.js",
  "/core/busytex/texlive-basic.js",
  "/core/busytex/texlive-basic.js.providespackage.txt",
  "/core/busytex/texlive-basic.profile",
  "/core/busytex/texlive-basic.txt",
  "/core/busytex/versions.txt",
  CHUNK_MANIFEST_URL,
  "/core/texmf/enumitem.sty",
  "/core/texmf/ragged2e.sty",
  "/core/texmf/setspace.sty",
  "/core/texmf/tabularx.sty",
  "/core/texmf/titlesec.sty",
  "/core/texmf/ctex-c5size.clo",
  "/core/texmf/ctex-cs4size.clo",
  "/core/texmf/ctex-engine-aptex.def",
  "/core/texmf/ctex-engine-luatex.def",
  "/core/texmf/ctex-engine-pdftex.def",
  "/core/texmf/ctex-engine-uptex.def",
  "/core/texmf/ctex-engine-xetex.def",
  "/core/texmf/ctex-fontset-adobe.def",
  "/core/texmf/ctex-fontset-fandol.def",
  "/core/texmf/ctex-fontset-founder.def",
  "/core/texmf/ctex-fontset-mac.def",
  "/core/texmf/ctex-fontset-macnew.def",
  "/core/texmf/ctex-fontset-macold.def",
  "/core/texmf/ctex-fontset-ubuntu.def",
  "/core/texmf/ctex-fontset-windows.def",
  "/core/texmf/ctex-heading-article.def",
  "/core/texmf/ctex-heading-beamer.def",
  "/core/texmf/ctex-heading-book.def",
  "/core/texmf/ctex-heading-report.def",
  "/core/texmf/ctex-name-gbk.cfg",
  "/core/texmf/ctex-name-utf8.cfg",
  "/core/texmf/ctex-scheme-chinese-article.def",
  "/core/texmf/ctex-scheme-chinese-beamer.def",
  "/core/texmf/ctex-scheme-chinese-book.def",
  "/core/texmf/ctex-scheme-chinese-report.def",
  "/core/texmf/ctex-scheme-chinese.def",
  "/core/texmf/ctex-scheme-plain-article.def",
  "/core/texmf/ctex-scheme-plain-beamer.def",
  "/core/texmf/ctex-scheme-plain-book.def",
  "/core/texmf/ctex-scheme-plain-report.def",
  "/core/texmf/ctex-scheme-plain.def",
  "/core/texmf/ctex.cfg",
  "/core/texmf/ctex.sty",
  "/core/texmf/ctexart.cls",
  "/core/texmf/ctexbackend.cfg",
  "/core/texmf/ctexbeamer.cls",
  "/core/texmf/ctexbook.cls",
  "/core/texmf/ctexcap.sty",
  "/core/texmf/ctexheading.sty",
  "/core/texmf/ctexhook.sty",
  "/core/texmf/ctexopts.cfg",
  "/core/texmf/ctexpatch.sty",
  "/core/texmf/ctexrep.cls",
  "/core/texmf/ctexsize.sty",
  "/core/texmf/ctexspa.def",
  "/core/texmf/fontspec.cfg",
  "/core/texmf/fontspec-luatex.sty",
  "/core/texmf/fontspec-xetex.sty",
  "/core/texmf/fontspec.lua",
  "/core/texmf/fontspec.sty",
  "/core/texmf/svgnam.def",
  "/core/texmf/x11nam.def",
  "/core/texmf/xcolor-2022-06-12.sty",
  "/core/texmf/xcolor.sty",
  "/core/texmf/xeCJK-listings.sty",
  "/core/texmf/xeCJK.cfg",
  "/core/texmf/xeCJK.sty",
  "/core/texmf/xeCJKfntef.sty",
  "/core/texmf/xunicode-addon.sty",
  "/core/texmf/zhnumber-big5.cfg",
  "/core/texmf/zhnumber-gbk.cfg",
  "/core/texmf/zhnumber-utf8.cfg",
  "/core/texmf/zhnumber.sty",
  "/fonts/latex/Sabon/SabonLTStd-Regular.ttf",
  "/fonts/latex/Sabon/SabonLTStd-Bold.ttf",
  "/fonts/latex/Sabon/SabonLTStd-Italic.ttf",
  "/fonts/latex/Sabon/SabonLTStd-BoldItalic.ttf",
  "/fonts/latex/Calluna/Calluna-Regular.otf",
  "/fonts/latex/Cronos/CronosProLT-Regular.ttf",
  "/fonts/latex/Courier/CourierNew-Regular.ttf",
  "/fonts/latex/Fangsong/Fangsong.ttf",
  "/fonts/latex/Kaiti/Kaiti.ttf",
  "/fonts/latex/SimHei/SimHei.ttf",
  "/fonts/latex/Simsun/Simsun.ttc",
  "/fonts/latex/YuGothic/YuGothB.ttc",
  "/fonts/latex/YuGothic/YuGothM.ttc",
  "/fonts/latex/YuMincho/yumin.ttf",
  "/fonts/latex/YuMincho/yumindb.ttf",
  "/fonts/latex/YuMincho/yuminl.ttf"
];

let chunkManifestPromise = null;

async function cacheUrls(cache, urls, concurrency = 8) {
  for (let index = 0; index < urls.length; index += concurrency) {
    await Promise.all(urls.slice(index, index + concurrency).map((url) => cache.add(url)));
  }
}

async function loadChunkManifest() {
  if (!chunkManifestPromise) {
    chunkManifestPromise = caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(CHUNK_MANIFEST_URL);
      if (cached) {
        return cached.json();
      }

      const response = await fetch(CHUNK_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`Unable to load ${CHUNK_MANIFEST_URL}`);
      }

      await cache.put(CHUNK_MANIFEST_URL, response.clone());
      return response.json();
    });
  }

  return chunkManifestPromise;
}

async function cacheChunkAssets(cache) {
  const manifest = await loadChunkManifest();
  const chunks = Object.values(manifest).flat();
  await cacheUrls(cache, chunks, 4);
}

function chunkedAssetContentType(pathname) {
  if (pathname.endsWith(".wasm")) {
    return "application/wasm";
  }

  if (pathname.endsWith(".data")) {
    return "application/octet-stream";
  }

  return "application/octet-stream";
}

async function chunkedAssetResponse(pathname) {
  const manifest = await loadChunkManifest();
  const chunks = manifest[pathname];
  if (!chunks) {
    return null;
  }

  const cache = await caches.open(CACHE_NAME);
  const parts = [];

  for (const chunk of chunks) {
    let response = await cache.match(chunk);
    if (!response) {
      response = await fetch(chunk);
      if (response.ok) {
        await cache.put(chunk, response.clone());
      }
    }

    if (!response.ok) {
      return response;
    }

    parts.push(await response.arrayBuffer());
  }

  return new Response(new Blob(parts, { type: chunkedAssetContentType(pathname) }), {
    headers: {
      "Content-Type": chunkedAssetContentType(pathname),
      "Cache-Control": "public, max-age=31556952, immutable"
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cacheUrls(cache, CORE_ASSETS);
      await cacheChunkAssets(cache);
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
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

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached && request.cache !== "reload" && request.cache !== "no-store") {
        return cached;
      }

      const chunked = await chunkedAssetResponse(url.pathname);
      if (chunked) {
        return chunked;
      }

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
