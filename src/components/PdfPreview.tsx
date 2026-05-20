import { useEffect, useRef, useState } from "react";
import type { CompileState } from "../lib/types";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfPreviewProps = {
  bytes: Uint8Array | null;
  compileState: CompileState;
};

export function PdfPreview({ bytes, compileState }: PdfPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const isCompiling = compileState === "compiling" || compileState === "loading";

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.replaceChildren();
    setPageCount(0);

    if (!bytes) {
      if (isCompiling) {
        const wrapper = document.createElement("div");
        wrapper.className = "compile-anim";
        wrapper.setAttribute("aria-live", "polite");
        wrapper.innerHTML = `
          <div class="compile-spinner">
            <div class="compile-spinner-ring"></div>
            <div class="compile-spinner-ring"></div>
            <div class="compile-spinner-ring"></div>
          </div>
          <p class="compile-anim-title">Compiling your CV</p>
          <p class="compile-anim-sub">Setting up the TeX environment — first compile can take <span class="compile-highlight">a few minutes</span>.</p>
        `;
        host.appendChild(wrapper);
      } else {
        const wrapper = document.createElement("div");
        wrapper.className = "compile-anim";
        wrapper.innerHTML = `
          <div class="compile-idle-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
              <path d="M14 2v6h6"/>
              <path d="M16 13H8"/>
              <path d="M16 17H8"/>
              <path d="M10 9H8"/>
            </svg>
          </div>
          <p class="compile-anim-title">No preview yet</p>
          <p class="compile-anim-sub">Hit <strong>Compile</strong> to generate your CV.</p>
        `;
        host.appendChild(wrapper);
      }
      return;
    }

    const target = host;
    const pdfBytes = new Uint8Array(bytes);

    async function render() {
      const hostWidth = Math.min(target.clientWidth || 760, 880);
      const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      if (cancelled) {
        return;
      }

      setPageCount(pdf.numPages);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.45, hostWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          continue;
        }

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "pdf-page";
        canvas.setAttribute("aria-label", `PDF page ${pageNumber}`);
        target.appendChild(canvas);

        await page.render({ canvas, canvasContext: context, viewport }).promise;
      }
    }

    render().catch((error) => {
      if (!cancelled) {
        const message = document.createElement("p");
        message.className = "preview-empty";
        message.textContent = error instanceof Error ? error.message : "Unable to render PDF.";
        host.replaceChildren(message);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bytes, isCompiling]);

  return (
    <div className="preview-shell">
      <div className="preview-meta">
        <span>{bytes ? `${pageCount || "..."} page PDF` : isCompiling ? "Compiling..." : "No PDF yet"}</span>
      </div>
      <div ref={hostRef} className={`pdf-host${isCompiling ? " pdf-host--compiling" : ""}`} />
    </div>
  );
}
