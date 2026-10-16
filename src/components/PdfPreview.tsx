import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FileText } from "lucide-react";
import type { CompileState } from "../lib/types";
import { analyzeLayout, type LayoutIssue, type PdfPageText, type PdfTextRun } from "../lib/layoutAnalysis";
import { CLASSIC_LAYOUT } from "../lib/templates/classic";
import type { TemplateLayout } from "../lib/templates/shared";
import { formatDownload, type DownloadProgress } from "../lib/runtimeAssets";
import { DownloadCard } from "./DownloadCard";
import { extractPageText } from "../lib/pdfText";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type Zoom = number | "fit";
/** Where to scroll: the n-th CV in the PDF (one per enabled language) and a heading in it. */
export type PreviewFocus = { cvIndex: number; text: string; nonce: number };
export type PageInfo = { current: number; total: number };

type PdfPreviewProps = {
  bytes: Uint8Array | null;
  /** Geometry of the template the PDF was typeset with. */
  layout: TemplateLayout;
  compileState: CompileState;
  /** Engine download in progress, if any. */
  download: DownloadProgress | null;
  zoom: Zoom;
  showLayoutHints: boolean;
  activeIssueId: string | null;
  /** `analysed` is false when the preview was cleared and nothing has been checked. */
  onLayoutIssues: (issues: LayoutIssue[], analysed: boolean) => void;
  onSelectIssue: (issue: LayoutIssue) => void;
  onPageInfo: (info: PageInfo) => void;
  focus: PreviewFocus | null;
  /** Effective scale after fitting, for the zoom readout. */
  onScale: (scale: number) => void;
};

const PAGE_GAP = 16;
const SIDE_PADDING = 48;
const MAX_SCALE = 3;

function issueMarker(issue: LayoutIssue, onSelect: (issue: LayoutIssue) => void): HTMLElement | null {
  if (!issue.rect || issue.rect.height <= 0) {
    return null;
  }
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `layout-marker layout-marker--${issue.kind}`;
  marker.dataset.issueId = issue.id;
  marker.title = `${issue.title}\n${issue.detail}`;
  marker.setAttribute("aria-label", issue.title);
  marker.style.left = `${issue.rect.x * 100}%`;
  marker.style.top = `${issue.rect.y * 100}%`;
  marker.style.width = `${issue.rect.width * 100}%`;
  marker.style.height = `${issue.rect.height * 100}%`;
  marker.addEventListener("click", () => onSelect(issue));
  return marker;
}

export function PdfPreview({
  bytes,
  layout,
  compileState,
  download,
  zoom,
  showLayoutHints,
  activeIssueId,
  onLayoutIssues,
  onSelectIssue,
  onPageInfo,
  onScale,
  focus
}: PdfPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLayoutIssues, onSelectIssue, onPageInfo, onScale });
  callbacks.current = { onLayoutIssues, onSelectIssue, onPageInfo, onScale };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const analysis = useRef<{ bytes: Uint8Array; issues: LayoutIssue[]; texts: PdfPageText[] } | null>(null);
  const handledFocus = useRef(0);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(0);
  const [painted, setPainted] = useState(false);
  const busy = compileState === "compiling" || compileState === "loading";

  // Track the available width for "fit" (debounced while the splitter moves).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setWidth(element.clientWidth), 120);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const host = pagesRef.current;
    const viewport = viewportRef.current;
    if (!host || !viewport) return;
    if (!bytes) {
      host.replaceChildren();
      analysis.current = null;
      callbacks.current.onLayoutIssues([], false);
      setPainted(false);
      callbacks.current.onPageInfo({ current: 0, total: 0 });
      return;
    }
    if (width === 0) return;

    let cancelled = false;
    const pages: HTMLDivElement = host;
    const source = bytes;
    const data = new Uint8Array(source);

    async function render() {
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      if (cancelled) return;
      const first = await pdf.getPage(1);
      const base = first.getViewport({ scale: 1 });
      const scale = zoom === "fit" ? Math.min(MAX_SCALE, Math.max(0.3, (width - SIDE_PADDING) / base.width)) : zoom;
      const ratio = window.devicePixelRatio || 1;
      const needsAnalysis = analysis.current?.bytes !== source;
      const texts: PdfPageText[] = [];
      const wrappers: HTMLElement[] = [];
      // The first render draws page by page; later ones swap in all pages at
      // once so the old PDF stays visible without flicker.
      const progressive = pages.childElementCount === 0;
      const fragment: ParentNode = progressive ? pages : document.createDocumentFragment();

      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = number === 1 ? first : await pdf.getPage(number);
        if (cancelled) return;
        const pageViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;
        canvas.width = Math.floor(pageViewport.width * ratio);
        canvas.height = Math.floor(pageViewport.height * ratio);
        canvas.style.width = `${Math.floor(pageViewport.width)}px`;
        canvas.style.height = `${Math.floor(pageViewport.height)}px`;
        canvas.className = "pdf-page";
        canvas.setAttribute("aria-label", `Page ${number}`);
        const wrapper = document.createElement("div");
        wrapper.className = "pdf-page-wrap";
        wrapper.dataset.page = String(number);
        const label = document.createElement("span");
        label.className = "pdf-page-number";
        label.textContent = `${number} / ${pdf.numPages}`;
        wrapper.append(canvas, label);
        fragment.appendChild(wrapper);
        wrappers.push(wrapper);
        await page.render({
          canvas,
          canvasContext: context,
          viewport: pageViewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
        }).promise;
        if (progressive && number === 1) setPainted(true);
        if (needsAnalysis) texts.push(await extractPageText(page));
      }
      if (cancelled || !host || !viewport) return;

      if (needsAnalysis) {
        const issues = analyzeLayout(texts, layoutRef.current);
        analysis.current = { bytes: source, issues, texts };
        callbacks.current.onLayoutIssues(issues, true);
      }
      for (const issue of analysis.current?.issues ?? []) {
        const marker = issueMarker(issue, (selected) => callbacks.current.onSelectIssue(selected));
        if (marker) wrappers[issue.page - 1]?.appendChild(marker);
      }

      // Swap in the new pages at the same relative scroll position.
      const ratioY = viewport.scrollHeight > viewport.clientHeight ? viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight) : 0;
      if (!progressive) {
        host.replaceChildren(fragment);
        viewport.scrollTop = ratioY * (viewport.scrollHeight - viewport.clientHeight);
      }
      setError(null);
      callbacks.current.onScale(scale);
      callbacks.current.onPageInfo({ current: 1, total: pdf.numPages });
      setRendered((value) => value + 1);
      setPainted(true);
      void pdf.destroy();
    }

    render().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to render the PDF.");
    });
    return () => {
      cancelled = true;
    };
  }, [bytes, width, zoom]);

  // Current page: the one covering the middle of the viewport.
  useEffect(() => {
    const viewport = viewportRef.current;
    const host = pagesRef.current;
    if (!viewport || !host) return;
    const update = () => {
      const middle = viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
      const pages = [...host.querySelectorAll<HTMLElement>(".pdf-page-wrap")];
      const current = pages.findIndex((page) => page.getBoundingClientRect().bottom + PAGE_GAP / 2 >= middle);
      callbacks.current.onPageInfo({ current: pages.length ? (current < 0 ? pages.length : current + 1) : 0, total: pages.length });
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [rendered]);

  // Scroll to the selected section's heading (or the CV's first page).
  useEffect(() => {
    const viewport = viewportRef.current;
    const host = pagesRef.current;
    const texts = analysis.current?.texts;
    if (!focus || !viewport || !host || !texts?.length || handledFocus.current === focus.nonce) return;
    handledFocus.current = focus.nonce;
    const target = findHeading(texts, focus, layoutRef.current);
    const wrapper = target && host.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${target.page}"]`);
    if (!target || !wrapper) return;
    const top = wrapper.offsetTop + target.y * wrapper.offsetHeight - 72;
    viewport.scrollTo({ top: Math.max(0, top) });
    if (target.y > 0) {
      const flash = document.createElement("span");
      flash.className = "heading-flash";
      flash.style.top = `${target.y * 100}%`;
      wrapper.appendChild(flash);
      window.setTimeout(() => flash.remove(), 1400);
    }
  }, [focus, rendered]);

  useEffect(() => {
    const host = pagesRef.current;
    if (!host) return;
    host.querySelectorAll<HTMLElement>(".layout-marker").forEach((marker) => {
      marker.classList.toggle("active", marker.dataset.issueId === activeIssueId);
    });
    if (activeIssueId) {
      host.querySelector<HTMLElement>(`.layout-marker[data-issue-id="${CSS.escape(activeIssueId)}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [activeIssueId, rendered]);

  return (
    <div
      ref={viewportRef}
      className={`preview-viewport${busy && bytes ? " preview-viewport--stale" : ""}${showLayoutHints ? "" : " preview-viewport--hide-hints"}`}
      data-preview-viewport
    >
      {busy &&
        (download ? (
          <div
            className="progress-bar progress-bar--determinate"
            role="progressbar"
            aria-label="Downloading the TeX engine"
            aria-valuemin={0}
            aria-valuemax={download.total}
            aria-valuenow={download.loaded}
            aria-valuetext={formatDownload(download)}
            style={{ "--progress": `${(download.loaded / Math.max(download.total, 1)) * 100}%` } as CSSProperties}
          />
        ) : (
          <div className="progress-bar" role="progressbar" aria-label="Compiling" />
        ))}
      {!bytes && download && (
        <div className="preview-empty">
          <DownloadCard download={download} />
        </div>
      )}
      {!bytes && !download && (
        <div className="preview-empty">
          <FileText size={36} strokeWidth={1.25} />
          {busy ? (
            <>
              <strong>{compileState === "loading" ? "Starting the TeX engine" : "Compiling your CV"}</strong>
              <p>Everything runs in your browser.</p>
            </>
          ) : (
            <>
              <strong>No preview yet</strong>
              <p>Compile to see your CV here.</p>
            </>
          )}
        </div>
      )}
      {bytes && download && (
        // Fonts for a newly enabled language download over the current PDF.
        <div className="preview-download-overlay">
          <DownloadCard download={download} />
        </div>
      )}
      {bytes && !painted && !error && <p className="preview-rendering">Rendering preview…</p>}
      {error && <p className="preview-error">{error}</p>}
      <div ref={pagesRef} className="pdf-pages" />
    </div>
  );
}

const HEADER_FONT_SIZE = 20;
const PT_PER_CM = 72 / 2.54;

function letters(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Finds a section heading of the given CV; y is a fraction of the page height (0 = top). */
export function findHeading(
  texts: PdfPageText[],
  focus: PreviewFocus,
  layout: TemplateLayout = CLASSIC_LAYOUT
): { page: number; y: number } | null {
  const headingEnd = layout.headingEndCm * PT_PER_CM;
  const starts = texts.flatMap((page, index) => (page.runs.some((run) => run.fontSize >= HEADER_FONT_SIZE && run.text.trim()) ? [index] : []));
  const start = starts[focus.cvIndex] ?? 0;
  const end = starts[focus.cvIndex + 1] ?? texts.length;
  const needle = letters(focus.text.split("\n")[0] ?? "");
  if (needle.length >= 2) {
    for (let index = start; index < end; index += 1) {
      const page = texts[index];
      // Classic titles sit in the label column, left of the section body (a
      // bullet's text starts further right); Timeline titles span the width but
      // start at the margin in the heading size. Join a title's runs per line.
      const inHeading = (run: PdfTextRun) =>
        run.fontSize >= layout.headingMinFontSize && (layout.headingMinFontSize > 0 || run.x < headingEnd);
      const titleLines = new Set(page.runs.filter((run) => inHeading(run) && run.x < headingEnd).map((run) => Math.round(run.y)));
      const lines = new Map<number, string>();
      for (const run of page.runs) {
        const key = Math.round(run.y);
        if (!titleLines.has(key) || !inHeading(run)) continue;
        lines.set(key, (lines.get(key) ?? "") + run.text);
      }
      for (const [y, text] of [...lines.entries()].sort((a, b) => b[0] - a[0])) {
        if (letters(text).startsWith(needle)) return { page: index + 1, y: 1 - y / page.height };
      }
    }
  }
  return { page: start + 1, y: 0 };
}

/** Scrolls the preview to a page (1-based). */
export function scrollPreviewToPage(page: number) {
  const viewport = document.querySelector<HTMLElement>("[data-preview-viewport]");
  const target = viewport?.querySelector<HTMLElement>(`.pdf-page-wrap[data-page="${page}"]`);
  if (viewport && target) viewport.scrollTo({ top: target.offsetTop - PAGE_GAP, behavior: "smooth" });
}
