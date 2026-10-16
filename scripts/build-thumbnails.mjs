// Builds the template picker's thumbnails: the first page of the sample CV in every template and language, as
// src/assets/thumbnails/<template>-<language>.webp. They are committed, so only rerun this when a template's look
// or the sample CV changes (npm run thumbnails).
//
// Compiles with the full BusyTeX release in vendor/busytex (npm run assets:download) and the fonts in public/fonts,
// then rasterizes with Ghostscript and converts with ImageMagick (brew install ghostscript imagemagick).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const vendorDir = path.join(root, "vendor/busytex");
const texmfDir = path.join(root, "public/core/texmf");
const fontsDir = path.join(root, "public/fonts/latex");
const outDir = path.join(root, "src/assets/thumbnails");
/** Twice the width the picker shows them at, for high-density screens. */
const WIDTH_PX = 480;

function listFiles(dir, recursive) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? listFiles(full, true) : [];
    return entry.name.startsWith(".") ? [] : [full];
  });
}

for (const dir of [vendorDir, texmfDir, fontsDir]) {
  if (!existsSync(dir)) throw new Error(`${path.relative(root, dir)} is missing: run npm run assets:download first`);
}

const bundle = await build({
  entryPoints: [path.join(root, "scripts/thumbnail-cvs.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "error"
});
const { thumbnailCvs } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const work = mkdtempSync(path.join(tmpdir(), "cv-thumbnails-"));
try {
  const jobsPath = path.join(work, "jobs.json");
  const files = [
    ...listFiles(texmfDir, false).map((file) => ({ path: path.basename(file), source: file })),
    ...listFiles(fontsDir, true).map((file) => ({ path: `Fonts/${path.relative(fontsDir, file).split(path.sep).join("/")}`, source: file }))
  ];
  writeFileSync(jobsPath, JSON.stringify({ cvs: thumbnailCvs(), files }));
  const pdfDir = path.join(work, "pdf");
  mkdirSync(pdfDir);
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/busytex-node.mjs"), "pdfs", vendorDir, path.join(vendorDir, "texlive-basic.js"), jobsPath, path.join(work, "out.json"), pdfDir],
    { stdio: ["ignore", "ignore", "inherit"] }
  );

  mkdirSync(outDir, { recursive: true });
  for (const pdf of listFiles(pdfDir, false).filter((file) => file.endsWith(".pdf"))) {
    const name = path.basename(pdf, ".pdf");
    const png = path.join(work, `${name}.png`);
    execFileSync("gs", ["-q", "-sDEVICE=png16m", "-r200", "-dFirstPage=1", "-dLastPage=1", "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", "-o", png, pdf]);
    const webp = path.join(outDir, `${name}.webp`);
    execFileSync("magick", [png, "-resize", `${WIDTH_PX}x`, "-quality", "82", webp]);
    console.log(`wrote ${path.relative(root, webp)}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
