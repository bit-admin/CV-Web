// Prepares the runtime assets for static hosting and writes public/core/runtime-manifest.json.
//
// Every file the TeX engine needs (BusyTeX, supplemental TeX files, fonts) is listed in the manifest with its size
// and content hash, so the app can show download progress and cache each file under a versioned key. Large binaries
// are gzipped and split into parts under public/core/packs/: Cloudflare does not compress .data, .ttc or chunked
// files, and no static asset may exceed 25 MiB. The service worker serves the original URLs from the app's cache.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync, constants as zlibConstants } from "node:zlib";

const root = process.cwd();
const publicDir = path.join(root, "public");
const busytexDir = path.join(publicDir, "core/busytex");
const texmfDir = path.join(publicDir, "core/texmf");
const fontsDir = path.join(publicDir, "fonts/latex");
const packDir = path.join(publicDir, "core/packs");
const legacyChunkDir = path.join(busytexDir, "chunks");
const manifestPath = path.join(publicDir, "core/runtime-manifest.json");

const partSizeBytes = 24 * 1024 * 1024;
const packedExtensions = new Set([".wasm", ".data", ".ttf", ".otf", ".ttc"]);
const packThresholdBytes = 1024 * 1024;
// Too large to deploy even once compressed parts exist, so only the parts are kept.
const oversizedAssets = ["/core/busytex/busytex.wasm", "/core/busytex/texlive-basic.data"];
const unusedAssets = [
  "texlive-recommended.data",
  "texlive-recommended.js",
  "texlive-recommended.js.providespackage.txt",
  "texlive-recommended.profile",
  "texlive-recommended.txt",
  "texlive-extra.data",
  "texlive-extra.js",
  "texlive-extra.js.providespackage.txt",
  "texlive-extra.profile",
  "texlive-extra.txt"
];
const requiredSupplementalAssets = [
  "fontspec.cfg",
  "fontspec-luatex.sty",
  "fontspec-xetex.sty",
  "fontspec.lua",
  "fontspec.sty",
  "svgnam.def",
  "x11nam.def",
  "xcolor-2022-06-12.sty",
  "xcolor.sty"
];

function toPublicPath(filePath) {
  return `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`;
}

function fromPublicPath(publicPath) {
  return path.join(publicDir, ...publicPath.slice(1).split("/"));
}

function listFiles(dir, recursive) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? listFiles(full, true) : [];
    return entry.name.startsWith(".") ? [] : [full];
  });
}

function readJson(filePath) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null;
}

const previousManifest = readJson(manifestPath);
const legacyChunkManifest = readJson(path.join(legacyChunkDir, "manifest.json"));

/** Contents of an oversized asset whose original was removed by an earlier run. */
function recoverRemovedAsset(publicPath) {
  const packed = previousManifest?.files?.[publicPath];
  if (packed?.parts?.every((part) => existsSync(fromPublicPath(part.url)))) {
    return gunzipSync(Buffer.concat(packed.parts.map((part) => readFileSync(fromPublicPath(part.url)))));
  }
  const chunks = legacyChunkManifest?.[publicPath];
  if (chunks?.every((chunk) => existsSync(fromPublicPath(chunk)))) {
    return Buffer.concat(chunks.map((chunk) => readFileSync(fromPublicPath(chunk))));
  }
  throw new Error(`Missing ${publicPath}: run npm run assets:download.`);
}

function pack(publicPath, contents, hash) {
  const previous = previousManifest?.files?.[publicPath];
  if (previous?.hash === hash && previous.parts?.every((part) => existsSync(fromPublicPath(part.url)))) {
    return previous.parts;
  }

  const compressed = gzipSync(contents, { level: zlibConstants.Z_BEST_COMPRESSION });
  const parts = [];
  for (let offset = 0, index = 0; offset < compressed.length; offset += partSizeBytes, index += 1) {
    const part = compressed.subarray(offset, offset + partSizeBytes);
    const name = `${path.posix.basename(publicPath)}.${hash}.${String(index).padStart(3, "0")}.bin`;
    writeFileSync(path.join(packDir, name), part);
    parts.push({ url: `/core/packs/${name}`, size: part.length });
  }
  console.log(`packed ${publicPath}: ${(contents.length / 2 ** 20).toFixed(1)} MiB -> ${(compressed.length / 2 ** 20).toFixed(1)} MiB`);
  return parts;
}

for (const file of requiredSupplementalAssets) {
  const filePath = path.join(texmfDir, file);
  if (!existsSync(filePath) || statSync(filePath).size === 0) {
    throw new Error(`Missing supplemental TeX file ${filePath}`);
  }
}

for (const file of unusedAssets) {
  rmSync(path.join(busytexDir, file), { force: true });
}

mkdirSync(packDir, { recursive: true });

const sources = [...listFiles(busytexDir, false), ...listFiles(texmfDir, false), ...listFiles(fontsDir, true)].map(toPublicPath);
for (const publicPath of oversizedAssets) {
  if (!sources.includes(publicPath)) sources.push(publicPath);
}

const files = {};
for (const publicPath of sources.sort()) {
  const filePath = fromPublicPath(publicPath);
  const contents = existsSync(filePath) ? readFileSync(filePath) : recoverRemovedAsset(publicPath);
  const hash = createHash("sha256").update(contents).digest("hex").slice(0, 12);
  const entry = { size: contents.length, hash };
  if (packedExtensions.has(path.extname(publicPath)) && contents.length > packThresholdBytes) {
    entry.parts = pack(publicPath, contents, hash);
  }
  files[publicPath] = entry;
}

for (const publicPath of oversizedAssets) {
  rmSync(fromPublicPath(publicPath), { force: true });
}

const liveParts = new Set(Object.values(files).flatMap((entry) => (entry.parts ?? []).map((part) => path.posix.basename(part.url))));
for (const file of readdirSync(packDir)) {
  if (!liveParts.has(file)) rmSync(path.join(packDir, file));
}
rmSync(legacyChunkDir, { recursive: true, force: true });

writeFileSync(manifestPath, `${JSON.stringify({ files }, null, 2)}\n`);
const transfer = Object.values(files).reduce(
  (sum, entry) => sum + (entry.parts ? entry.parts.reduce((total, part) => total + part.size, 0) : entry.size),
  0
);
console.log(`wrote ${toPublicPath(manifestPath)}: ${Object.keys(files).length} files, ${(transfer / 2 ** 20).toFixed(1)} MiB to download`);
