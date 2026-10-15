// Runs the BusyTeX engine in Node for build-runtime-assets.mjs. BusyTeX keeps global state, so each command runs in
// its own process:
//
//   node scripts/busytex-node.mjs trace <engine-dir> <package-js> <jobs.json> <out.json> <out.data>
//     Compiles every CV with the full package, then finds the smallest set of package files that still produces
//     byte-identical PDFs. Writes their contents, concatenated, to out.data and {files, hashes} to out.json, where
//     files are {filename, start, end} offsets into out.data.
//   node scripts/busytex-node.mjs hashes <engine-dir> <package-js> <jobs.json> <out.json>
//     Compiles every CV and writes the PDF hashes.
//
// jobs.json: {"cvs": {name: tex}, "files": [{"path": "Fonts/x.ttf", "source": "/abs/path"}]} — the extra files the
// app writes into the project directory before compiling.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const [command, engineDir, packageJs, jobsPath, outPath, dataPath] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsPath, "utf8"));

// Font files the engine opens while scanning font directories but rarely uses; dropped unless a compile asks.
const OPTIONAL_FONT = /\/fonts\/(type1|opentype|truetype)\//;
// Opened on every run but not needed for this template's output. (ICU's data is needed: XeTeX reads font names
// through ICU converters when the engine starts.)
const NOT_NEEDED = [/\/fonts\/map\/pdftex\/updmap\/pdftex\.map$/];

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** `onFS` runs as soon as the engine's file system exists, before BusyTeX's start-up reads any files. */
async function startEngine(onFS = () => {}) {
  globalThis.self = globalThis;
  globalThis.require = createRequire(import.meta.url);
  globalThis.__dirname = engineDir;
  globalThis.__filename = path.join(engineDir, "busytex.js");
  const nodeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("/")) return nodeFetch(input, init);
    try {
      const type = url.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
      return new Response(readFileSync(url), { headers: { "Content-Type": type } });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
  const run = (file, suffix = "") => vm.runInThisContext(readFileSync(file, "utf8") + suffix, { filename: file });
  run(path.join(engineDir, "busytex_pipeline.js"), "\nglobalThis.BusytexPipeline = BusytexPipeline;");

  globalThis.BusytexPipeline.preRun.push((Module) => onFS(Module.FS));
  const quiet = () => {};
  const { log, error } = console;
  console.log = console.error = quiet;
  const pipeline = new globalThis.BusytexPipeline(
    path.join(engineDir, "busytex.js"),
    path.join(engineDir, "busytex.wasm"),
    [packageJs],
    [packageJs],
    [],
    quiet,
    quiet,
    true,
    async (script) => run(script)
  );
  // Reproducible output, so PDFs can be compared byte for byte.
  Object.assign(pipeline.env, { SOURCE_DATE_EPOCH: "1700000000", FORCE_SOURCE_DATE: "1" });
  const Module = await pipeline.Module;
  console.log = log;
  console.error = error;

  const files = jobs.files.map((file) => ({ path: file.path, contents: new Uint8Array(readFileSync(file.source)) }));
  const compile = async (tex) => {
    console.log = quiet;
    try {
      return await pipeline.compile(
        [{ path: "main.tex", contents: tex }, ...files],
        "main.tex",
        false,
        false,
        false,
        true,
        "silent",
        "xetex_bibtex8_dvipdfmx",
        [packageJs]
      );
    } finally {
      console.log = log;
    }
  };
  return { FS: Module.FS, compile };
}

async function compileAll(compile) {
  const hashes = {};
  for (const [name, tex] of Object.entries(jobs.cvs)) {
    const result = await compile(tex);
    hashes[name] = result.pdf?.length ? sha(result.pdf) : null;
    if (!hashes[name]) return { hashes, failure: result };
  }
  return { hashes };
}

function packageFiles() {
  const source = readFileSync(packageJs, "utf8");
  return [...source.matchAll(/"filename": *"([^"]*)"/g)].map((match) => match[1]);
}

/** Names of fonts a failed compile could not find. */
function missingFontNames(result) {
  const text = (result.logs ?? []).map((log) => [log.log, log.stdout, log.stderr].join("\n")).join("\n");
  const patterns = [
    /\[([\w.-]+?)\]:/g,
    /find this font:\s*([\w.-]+)/g,
    /"([\w.-]+\.(?:pfb|otf|ttf))"/g,
    /Font file name "([\w.-]+)"/g,
    /for TFM "([\w.-]+)"/g
  ];
  return new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => fontKey(match[1]))));
}

function fontKey(name) {
  return path.posix.basename(name).toLowerCase().replace(/\.(pfb|pfm|afm|otf|ttf)$/, "");
}

function recordTouches(FS, all, touched) {
  for (const name of ["open", "stat", "lstat", "readlink"]) {
    const original = FS[name];
    FS[name] = function (target) {
      if (typeof target === "string") {
        try {
          const full = FS.lookupPath(target, { follow: true }).path;
          if (all.has(full)) touched.add(full);
        } catch {
          // Missing paths are probes, not dependencies.
        }
      }
      return original.apply(this, arguments);
    };
  }
}

async function trace() {
  const all = new Set(packageFiles());
  const touched = new Set();
  const { FS, compile } = await startEngine((FS) => recordTouches(FS, all, touched));

  const baseline = await compileAll(compile);
  if (baseline.failure) throw new Error(`The full package fails to compile a CV: ${JSON.stringify(baseline.hashes)}`);

  // Hide (not delete) candidates so they can be restored when a compile asks for them.
  for (const file of all) {
    if (!touched.has(file) || NOT_NEEDED.some((pattern) => pattern.test(file))) FS.unlink(file);
  }
  FS.mkdir("/hidden");
  const hidden = new Map();
  for (const file of touched) {
    if (OPTIONAL_FONT.test(file) && FS.analyzePath(file).exists) {
      const parked = `/hidden/${hidden.size}`;
      FS.rename(file, parked);
      hidden.set(file, parked);
    }
  }

  for (;;) {
    const attempt = await compileAll(compile);
    if (!attempt.failure) {
      const changed = Object.keys(baseline.hashes).filter((name) => attempt.hashes[name] !== baseline.hashes[name]);
      if (changed.length) throw new Error(`Trimmed package changes the PDF of: ${changed.join(", ")}`);
      break;
    }
    const wanted = missingFontNames(attempt.failure);
    const restore = [...hidden.keys()].filter((file) => wanted.has(fontKey(file)));
    if (!restore.length) {
      const tail = (attempt.failure.logs ?? []).map((log) => log.stderr).join("\n").slice(-1500);
      throw new Error(`Trimmed package fails and no hidden font explains it:\n${tail}`);
    }
    for (const file of restore) {
      FS.rename(hidden.get(file), file);
      hidden.delete(file);
    }
  }

  const files = [];
  const contents = [];
  let offset = 0;
  for (const filename of [...all].filter((file) => FS.analyzePath(file).exists).sort()) {
    const bytes = FS.readFile(filename);
    files.push({ filename, start: offset, end: offset + bytes.length });
    contents.push(bytes);
    offset += bytes.length;
  }
  writeFileSync(dataPath, Buffer.concat(contents));
  return { files, hashes: baseline.hashes };
}

const result =
  command === "trace"
    ? await trace()
    : command === "hashes"
      ? await (async () => {
          const { hashes, failure } = await compileAll((await startEngine()).compile);
          return failure ? { ...hashes, error: (failure.logs ?? []).map((log) => log.stderr || log.stdout).join("\n").slice(-2000) } : hashes;
        })()
      : (() => {
          throw new Error(`Unknown command ${command}`);
        })();
writeFileSync(outPath, JSON.stringify(result));
process.exit(0);
