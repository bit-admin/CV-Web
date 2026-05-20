import { BusyTexRunner, XeLatex, type FileInput } from "texlyre-busytex";
import { latexFontAssets, supplementalTexliveAssets, type RuntimeAsset } from "./assets";
import type { CompileResult } from "./types";

const DATA_PACKAGES = ["/core/busytex/texlive-basic.js"];

async function fetchBytes(asset: RuntimeAsset): Promise<Uint8Array> {
  const response = await fetch(asset.url, { cache: "reload" });
  if (!response.ok) {
    throw new Error(`Missing runtime asset ${asset.url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

let additionalFilesPromise: Promise<FileInput[]> | null = null;

async function loadAdditionalFiles(): Promise<FileInput[]> {
  if (!additionalFilesPromise) {
    additionalFilesPromise = Promise.all(
      [...latexFontAssets, ...supplementalTexliveAssets].map(async (asset) => ({
        path: asset.path,
        content: await fetchBytes(asset)
      }))
    );
  }

  return additionalFilesPromise;
}

export class LatexEngineService {
  private runner: BusyTexRunner | null = null;
  private xelatex: XeLatex | null = null;

  async load(): Promise<void> {
    if (this.runner?.isInitialized() && this.xelatex) {
      return;
    }

    const runner = new BusyTexRunner({
      busytexBasePath: "/core/busytex",
      engineMode: "combined",
      catalogDataPackages: DATA_PACKAGES
    });
    await runner.initialize(true);

    this.runner = runner;
    this.xelatex = new XeLatex(runner);
  }

  async compile(tex: string): Promise<CompileResult> {
    const started = performance.now();
    await this.load();

    if (!this.xelatex) {
      throw new Error("BusyTeX XeLaTeX engine is not ready.");
    }

    const result = await this.xelatex.compile({
      input: tex,
      mainTexPath: "main.tex",
      rerun: true,
      verbose: "silent",
      dataPackagesJs: DATA_PACKAGES,
      additionalFiles: await loadAdditionalFiles()
    });

    if (!result.success || !result.pdf) {
      throw new Error(result.log || `XeLaTeX failed with exit code ${result.exitCode}.`);
    }

    return {
      pdf: result.pdf,
      log: result.log,
      tex,
      durationMs: Math.round(performance.now() - started)
    };
  }

  close(): void {
    this.runner?.terminate();
    this.runner = null;
    this.xelatex = null;
  }
}
