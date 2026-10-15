import { BusyTexRunner, XeLatex, type FileInput } from "texlyre-busytex";
import type { RuntimeAsset } from "./assets";
import { readRuntimeAsset } from "./runtimeAssets";
import type { CompileResult } from "./types";

const DATA_PACKAGES = ["/core/busytex/texlive-basic.js"];

const fileContents = new Map<string, Promise<Uint8Array>>();

function loadAdditionalFiles(assets: RuntimeAsset[]): Promise<FileInput[]> {
  return Promise.all(
    assets.map(async (asset) => {
      let content = fileContents.get(asset.url);
      if (!content) {
        content = readRuntimeAsset(asset.url);
        content.catch(() => fileContents.delete(asset.url));
        fileContents.set(asset.url, content);
      }
      return { path: asset.path, content: await content };
    })
  );
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

  /** Compiles `tex`, writing `additionalAssets` (fonts, supplemental TeX files) into the engine's file system first. */
  async compile(tex: string, additionalAssets: RuntimeAsset[]): Promise<CompileResult> {
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
      additionalFiles: await loadAdditionalFiles(additionalAssets)
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
