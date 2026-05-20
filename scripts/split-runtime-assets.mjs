import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const chunkSizeBytes = 24 * 1024 * 1024;
const chunkDir = path.join(root, "public/core/busytex/chunks");
const busytexDir = path.join(root, "public/core/busytex");
const texmfDir = path.join(root, "public/core/texmf");
const oversizedAssets = [
  "public/core/busytex/busytex.wasm",
  "public/core/busytex/texlive-basic.data"
];
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
  return `/${path.relative(path.join(root, "public"), filePath).split(path.sep).join("/")}`;
}

function chunkPrefix(assetPath) {
  return `${path.basename(assetPath)}.part-`;
}

function existingChunks(assetPath) {
  if (!existsSync(chunkDir)) {
    return [];
  }

  const prefix = chunkPrefix(assetPath);
  return readdirSync(chunkDir)
    .filter((file) => file.startsWith(prefix))
    .sort()
    .map((file) => `/core/busytex/chunks/${file}`);
}

function splitAsset(assetPath) {
  const prefix = chunkPrefix(assetPath);
  for (const file of readdirSync(chunkDir).filter((item) => item.startsWith(prefix))) {
    unlinkSync(path.join(chunkDir, file));
  }

  const fd = openSync(assetPath, "r");
  const buffer = Buffer.allocUnsafe(chunkSizeBytes);
  const chunks = [];
  let index = 0;

  try {
    while (true) {
      const bytesRead = readSync(fd, buffer, 0, chunkSizeBytes, null);
      if (bytesRead === 0) {
        break;
      }

      const name = `${prefix}${String(index).padStart(3, "0")}`;
      const outputPath = path.join(chunkDir, name);
      writeFileSync(outputPath, buffer.subarray(0, bytesRead));
      chunks.push(`/core/busytex/chunks/${name}`);
      index += 1;
    }
  } finally {
    closeSync(fd);
  }

  rmSync(assetPath);
  return chunks;
}

mkdirSync(chunkDir, { recursive: true });
mkdirSync(texmfDir, { recursive: true });

for (const file of requiredSupplementalAssets) {
  const filePath = path.join(texmfDir, file);
  if (!existsSync(filePath) || statSync(filePath).size === 0) {
    throw new Error(`Missing supplemental TeX file ${filePath}`);
  }
}

for (const file of unusedAssets) {
  const filePath = path.join(busytexDir, file);
  if (existsSync(filePath)) {
    rmSync(filePath);
  }
}

for (const file of readdirSync(chunkDir).filter(
  (item) => item.startsWith("texlive-recommended.data.part-") || item.startsWith("texlive-extra.data.part-")
)) {
  unlinkSync(path.join(chunkDir, file));
}

const manifest = {};

for (const relativePath of oversizedAssets) {
  const assetPath = path.join(root, relativePath);
  const publicPath = toPublicPath(assetPath);

  if (existsSync(assetPath)) {
    const size = statSync(assetPath).size;
    if (size <= chunkSizeBytes) {
      continue;
    }

    manifest[publicPath] = splitAsset(assetPath);
    continue;
  }

  const chunks = existingChunks(assetPath);
  if (chunks.length === 0) {
    throw new Error(`Missing ${relativePath} and no chunks are present.`);
  }

  manifest[publicPath] = chunks;
}

writeFileSync(path.join(chunkDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
