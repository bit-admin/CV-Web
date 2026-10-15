import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Ellipsis,
  FileCode2,
  Github,
  Library,
  Maximize2,
  Minus,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scale,
  Sparkles,
  Undo2,
  X
} from "lucide-react";
import { AiWizardModal } from "./components/AiWizard";
import { useConfirm } from "./components/ConfirmDialog";
import { BlockEditor, HeaderEditor } from "./components/BlockEditor";
import { LayoutDock } from "./components/LayoutPanel";
import { LibraryModal } from "./components/LibraryModal";
import { PdfPreview, scrollPreviewToPage, type PageInfo, type PreviewFocus, type Zoom } from "./components/PdfPreview";
import { Sidebar } from "./components/Sidebar";
import { IconButton, Kbd, keys, MenuButton, MOD } from "./components/ui";
import { createEmptyBlock, createSampleWorkspace, duplicateBlock } from "./lib/document";
import { summarizeTexLog } from "./lib/editing";
import { cjkFontUrls, latexFontAssets, runtimeAssetGroup, runtimeAssetUrls, supplementalTexliveAssets } from "./lib/assets";
import { cjkFontGroups, renderLatex } from "./lib/latex";
import { LatexEngineService } from "./lib/latexEngine";
import { locateSnippet, type LayoutIssue } from "./lib/layoutAnalysis";
import { loadLibrary } from "./lib/library";
import { formatDownload, pendingDownloadSize, prepareRuntimeAssets, type DownloadProgress } from "./lib/runtimeAssets";
import { registerServiceWorker } from "./lib/serviceWorker";
import type { CompileResult, CompileState, CVBlock, CVBlockType, CVDocument, CVLanguageCode, CVWorkspace } from "./lib/types";
import { useHistory } from "./lib/useHistory";
import { useLibrary } from "./lib/useLibrary";

type Selection = "header" | string;
type ModalId = "library" | "ai" | "help" | "license";
type Toast = { text: string; action?: { label: string; run: () => void } };

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const AUTO_COMPILE_DELAY_MS = 1200;
const EDITOR_WIDTH_KEY = "cv-forge-editor-width";
const AUTO_COMPILE_KEY = "cv-forge-auto-compile";
const SIDEBAR_WIDTH = 236;
const MIN_EDITOR = 400;
const MIN_PREVIEW = 420;

function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Settings are a convenience; ignore storage failures.
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function fileBaseName(workspace: CVWorkspace, cvName: string): string {
  const language = workspace.languages.find((item) => item.enabled && item.document.header.name.trim());
  const base = language?.document.header.name.trim() || cvName;
  return `${base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_") || "cv"}_CV`;
}

function HelpContent() {
  const rows: Array<[ReactNode, string]> = [
    [<><Kbd>{MOD}Enter</Kbd></>, "Compile now"],
    [<><Kbd>{MOD}S</Kbd></>, "Save a named version of the CV"],
    [<><Kbd>{MOD}Z</Kbd> / <Kbd>{MOD}Shift+Z</Kbd></>, "Undo / redo (outside text fields, or use the toolbar)"],
    [<><Kbd>Enter</Kbd></>, "In a list: new bullet, item or contact (splits at the caret)"],
    [<><Kbd>Backspace</Kbd></>, "At the start of a list item: join it with the one above"],
    [<><Kbd>Alt+↑</Kbd> / <Kbd>Alt+↓</Kbd></>, "Move a list item up or down"],
    [<><Kbd>↑</Kbd> / <Kbd>↓</Kbd></>, "At the first or last line: go to the previous or next item"]
  ];
  return (
    <>
      <h3>Formatting</h3>
      <dl className="help-list">
        <dt><code>**double asterisks**</code></dt>
        <dd><strong>Bold</strong> · <Kbd>{MOD}B</Kbd></dd>
        <dt><code>_underscores_</code></dt>
        <dd><em>Italic</em> · <Kbd>{MOD}I</Kbd></dd>
        <dt><code>`backticks`</code></dt>
        <dd><code>Code style</code> (e.g. <code>Python</code>) · <Kbd>{MOD}E</Kbd></dd>
      </dl>
      <p className="help-note">Select text and press the shortcut to wrap it; press it again to remove the formatting.</p>
      <h3>Keyboard</h3>
      <dl className="help-list">
        {rows.map(([keys, text], index) => (
          <div key={index} className="help-row">
            <dt>{keys}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <h3>Lists</h3>
      <p>
        Paste several lines into a bullet or list item to split them into separate items; leading “•”, “-” or “1.”
        markers are removed. Drag sections in the outline to reorder them.
      </p>
      <h3>Layout check</h3>
      <p>
        After each compile the PDF is checked for pages left partly blank, a nearly empty last page and paragraphs whose
        last line holds only a word or two. Click a suggestion to jump to the section.
      </p>
    </>
  );
}

function LicenseContent() {
  return (
    <>
      <h3>BusyTeX</h3>
      <p>
        Licensed under the GNU Affero General Public License v3.0.
        <br />
        Full text: <a href="/licenses/BusyTeX-AGPL-3.0.txt" target="_blank" rel="noopener noreferrer">BusyTeX-AGPL-3.0.txt</a>
      </p>
      <h3>TeX Live</h3>
      <p>
        Licensed under the LaTeX Project Public License v1.3c.
        <br />
        Full text: <a href="/licenses/TeXLive-LPPL-1.3c.tex" target="_blank" rel="noopener noreferrer">TeXLive-LPPL-1.3c.tex</a>
      </p>
      <h3>LaTeX Template</h3>
      <p>
        Based on <strong>yuan-resume</strong> by HF Yuan
        (<a href="https://github.com/xyz-yuanhf/yuan-resume" target="_blank" rel="noopener noreferrer">github.com/xyz-yuanhf/yuan-resume</a>).
        <br />
        Original license: MIT.
        <br />
        Substantial modifications and multilingual support by Haruka Kobayashi.
        <br />
        Copyright (c) 2026 bit-admin. Licensed under MIT.
      </p>
    </>
  );
}

export function App() {
  const engineRef = useRef<LatexEngineService | null>(null);
  const bootedRef = useRef(false);
  const [boot] = useState(loadLibrary);
  const [workspace, setWorkspace] = useState<CVWorkspace>(boot.workspace);
  const [activeSelection, setActiveSelection] = useState<Selection>("header");
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compileError, setCompileError] = useState<{ message: string; log: string; tex: string } | null>(null);
  const [compilePending, setCompilePending] = useState(false);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [fontDownloads, setFontDownloads] = useState<Partial<Record<CVLanguageCode, number>>>({});
  const [autoCompile, setAutoCompile] = useState(() => readSetting(AUTO_COMPILE_KEY, true));
  const [activeModal, setActiveModal] = useState<null | ModalId>(null);
  const [layoutIssues, setLayoutIssues] = useState<LayoutIssue[]>([]);
  const [analysed, setAnalysed] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [showLayoutHints, setShowLayoutHints] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [scale, setScale] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ current: 0, total: 0 });
  const [editorWidth, setEditorWidth] = useState(() => readSetting(EDITOR_WIDTH_KEY, 0));
  const [toast, setToast] = useState<Toast | null>(null);
  const closeModal = useCallback(() => setActiveModal(null), []);
  const confirm = useConfirm();

  const history = useHistory(workspace, setWorkspace);
  const { reset: resetHistory } = history;

  // Another CV or a restored version replaced the workspace: start from its
  // header, forget the undo history and recompile once the engine is free.
  const replaceFromLibrary = useCallback(
    (next: CVWorkspace) => {
      resetHistory(next);
      setWorkspace(next);
    },
    [resetHistory]
  );
  const handleSwitched = useCallback(() => {
    setActiveSelection("header");
    setCompileError(null);
    setCompilePending(true);
  }, []);
  const library = useLibrary(boot.index, workspace, replaceFromLibrary, handleSwitched);
  const { saveNamedVersion, saveVersion } = library;

  const activeLanguage = workspace.languages.find((language) => language.code === workspace.activeLanguage) ?? workspace.languages[0];
  const cvDocument = activeLanguage.document;
  const tex = useMemo(() => renderLatex(workspace), [workspace]);
  const { zh: needsZhFonts, ja: needsJaFonts } = cjkFontGroups(workspace);
  const fontGroups = useMemo(() => ({ zh: needsZhFonts, ja: needsJaFonts }), [needsZhFonts, needsJaFonts]);
  const activeBlock = activeSelection === "header" ? null : cvDocument.blocks.find((block) => block.id === activeSelection) ?? null;
  const activeBlockIndex = activeBlock ? cvDocument.blocks.findIndex((block) => block.id === activeBlock.id) : -1;
  const upToDate = compileResult?.tex === tex;

  // Follow the selection in the preview: the same section in the same language's CV.
  const [previewFocus, setPreviewFocus] = useState<PreviewFocus | null>(null);
  const focusTitle = activeBlock && !activeBlock.hidden ? activeBlock.title : "";
  const cvIndex = workspace.languages.filter((language) => language.enabled).findIndex((language) => language.code === workspace.activeLanguage);
  useEffect(() => {
    if (cvIndex < 0) return;
    setPreviewFocus((current) => ({ cvIndex, text: focusTitle, nonce: (current?.nonce ?? 0) + 1 }));
    // Only a change of selection scrolls; editing the title does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelection, cvIndex]);
  const busy = compileState === "compiling" || compileState === "loading";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.action ? 6000 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (activeSelection !== "header" && !cvDocument.blocks.some((block) => block.id === activeSelection)) {
      setActiveSelection(cvDocument.blocks[0]?.id ?? "header");
    }
  }, [activeSelection, cvDocument.blocks]);

  // ── Workspace edits ─────────────────────────────────────

  const updateWorkspace = useCallback((mutate: (draft: CVWorkspace) => void) => {
    setWorkspace((current) => {
      const draft = structuredClone(current);
      mutate(draft);
      return draft;
    });
  }, []);

  const updateDocument = useCallback(
    (mutate: (draft: CVDocument) => void) => {
      updateWorkspace((draft) => {
        const language = draft.languages.find((item) => item.code === draft.activeLanguage) ?? draft.languages[0];
        mutate(language.document);
      });
    },
    [updateWorkspace]
  );

  // Switching language keeps the same position in the outline (the same
  // section in another language usually sits at the same index).
  const selectLanguage = useCallback(
    (code: CVLanguageCode) => {
      const target = workspace.languages.find((language) => language.code === code)?.document.blocks;
      setActiveSelection(activeBlockIndex >= 0 && target?.length ? target[Math.min(activeBlockIndex, target.length - 1)].id : "header");
      updateWorkspace((draft) => {
        draft.activeLanguage = code;
      });
    },
    [activeBlockIndex, updateWorkspace, workspace.languages]
  );

  const toggleLanguage = useCallback(
    (code: CVLanguageCode) => {
      updateWorkspace((draft) => {
        const language = draft.languages.find((item) => item.code === code);
        if (!language || (language.enabled && draft.languages.filter((item) => item.enabled).length === 1)) {
          return;
        }
        language.enabled = !language.enabled;
      });
    },
    [updateWorkspace]
  );

  const replaceBlock = useCallback(
    (nextBlock: CVBlock) => {
      updateDocument((draft) => {
        const index = draft.blocks.findIndex((block) => block.id === nextBlock.id);
        if (index >= 0) draft.blocks[index] = nextBlock;
      });
    },
    [updateDocument]
  );

  const addBlock = useCallback(
    (type: CVBlockType) => {
      const block = createEmptyBlock(type);
      history.checkpoint();
      updateDocument((draft) => {
        const index = activeBlockIndex >= 0 ? activeBlockIndex + 1 : draft.blocks.length;
        draft.blocks.splice(index, 0, block);
      });
      setActiveSelection(block.id);
    },
    [activeBlockIndex, history, updateDocument]
  );

  const reorderBlocks = useCallback(
    (from: number, to: number) => {
      history.checkpoint();
      updateDocument((draft) => {
        const [block] = draft.blocks.splice(from, 1);
        draft.blocks.splice(to, 0, block);
      });
    },
    [history, updateDocument]
  );

  const duplicateActiveBlock = useCallback(() => {
    if (!activeBlock) return;
    const copy = duplicateBlock(activeBlock);
    history.checkpoint();
    updateDocument((draft) => {
      const index = draft.blocks.findIndex((block) => block.id === activeBlock.id);
      draft.blocks.splice(index + 1, 0, copy);
    });
    setActiveSelection(copy.id);
  }, [activeBlock, history, updateDocument]);

  const deleteActiveBlock = useCallback(() => {
    if (!activeBlock) return;
    const nextSelection = cvDocument.blocks[activeBlockIndex + 1]?.id ?? cvDocument.blocks[activeBlockIndex - 1]?.id ?? "header";
    history.checkpoint();
    updateDocument((draft) => {
      draft.blocks = draft.blocks.filter((block) => block.id !== activeBlock.id);
    });
    setActiveSelection(nextSelection);
    const title = activeBlock.title.replace(/\n/g, " ") || "section";
    setToast({
      text: `Deleted “${title}”`,
      action: {
        label: "Undo",
        run: () => {
          history.undo();
          setActiveSelection(activeBlock.id);
        }
      }
    });
  }, [activeBlock, activeBlockIndex, cvDocument.blocks, history, updateDocument]);

  const toggleActiveBlockHidden = useCallback(() => {
    if (!activeBlock) return;
    history.checkpoint();
    updateDocument((draft) => {
      const block = draft.blocks.find((item) => item.id === activeBlock.id);
      if (block) block.hidden = !block.hidden;
    });
  }, [activeBlock, history, updateDocument]);

  // ── Compile ─────────────────────────────────────────────

  const compile = useCallback(async () => {
    const engine = engineRef.current ?? new LatexEngineService();
    engineRef.current = engine;
    setCompileState((state) => (state === "loading" ? state : "compiling"));
    const source = tex;
    try {
      // Fetches whatever the engine still lacks: everything on a first visit, CJK fonts when a language needs them.
      await prepareRuntimeAssets(
        runtimeAssetUrls(fontGroups),
        (progress) => {
          setCompileState("loading");
          setDownload(progress);
        },
        runtimeAssetGroup
      );
      setDownload(null);
      const result = await engine.compile(source, [...latexFontAssets(fontGroups), ...supplementalTexliveAssets]);
      setCompileResult(result);
      setCompileError(null);
      setCompileState("ready");
    } catch (error) {
      setDownload(null);
      const log = error instanceof Error ? error.message : String(error);
      const summary = summarizeTexLog(log);
      setCompileError({ message: summary?.message ?? log.split("\n")[0].slice(0, 200), log, tex: source });
      setCompileState("error");
    }
  }, [fontGroups, tex]);

  const requestCompile = useCallback(() => setCompilePending(true), []);

  useEffect(() => {
    if (compilePending && bootedRef.current && compileState !== "compiling" && compileState !== "loading") {
      setCompilePending(false);
      void compile();
    }
  }, [compile, compilePending, compileState]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    async function start() {
      setCompileState("loading");
      await registerServiceWorker();
      await compile();
    }
    start().catch((error) => {
      setCompileState("error");
      const log = error instanceof Error ? error.message : String(error);
      setCompileError({ message: log.split("\n")[0], log, tex: "" });
    });
  }, [compile]);

  useEffect(() => () => engineRef.current?.close(), []);

  // How much turning on Chinese or Japanese would download, for the language list; rechecked after each download.
  useEffect(() => {
    if (download) return;
    let cancelled = false;
    void Promise.all([pendingDownloadSize(cjkFontUrls("zh")), pendingDownloadSize(cjkFontUrls("ja"))]).then(([zh, ja]) => {
      if (!cancelled) setFontDownloads({ zh, ja });
    });
    return () => {
      cancelled = true;
    };
  }, [download]);

  // Auto-compile shortly after edits stop (not again for a source that just failed).
  useEffect(() => {
    if (!autoCompile || upToDate || busy || compilePending || compileError?.tex === tex || compileState === "idle") return;
    const timer = window.setTimeout(() => setCompilePending(true), AUTO_COMPILE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoCompile, busy, compileError, compilePending, compileState, tex, upToDate]);

  // ── Layout check ────────────────────────────────────────

  const handleLayoutIssues = useCallback((issues: LayoutIssue[], done: boolean) => {
    setLayoutIssues(issues);
    setAnalysed(done);
    setActiveIssueId(null);
  }, []);

  const issueTargets = useMemo(
    () => new Map(layoutIssues.map((issue) => [issue.id, issue.snippet ? locateSnippet(workspace, issue.snippet) : null])),
    [layoutIssues, workspace]
  );
  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    issueTargets.forEach((target) => {
      if (target && target.language === workspace.activeLanguage) counts.set(target.blockId, (counts.get(target.blockId) ?? 0) + 1);
    });
    return counts;
  }, [issueTargets, workspace.activeLanguage]);

  const selectLayoutIssue = useCallback(
    (issue: LayoutIssue) => {
      setActiveIssueId(issue.id);
      setShowLayoutHints(true);
      const target = issueTargets.get(issue.id);
      if (target) {
        if (target.language !== workspace.activeLanguage) {
          updateWorkspace((draft) => {
            draft.activeLanguage = target.language;
          });
        }
        setActiveSelection(target.blockId);
      }
    },
    [issueTargets, updateWorkspace, workspace.activeLanguage]
  );

  // ── Global keyboard shortcuts ───────────────────────────

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveNamedVersion("");
      } else if (key === "enter") {
        event.preventDefault();
        requestCompile();
      } else if ((key === "z" || key === "y") && !isTextField(event.target) && !activeModal) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) history.redo();
        else history.undo();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeModal, history, requestCompile, saveNamedVersion]);

  useEffect(() => {
    if (!activeModal) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeModal, closeModal]);

  // ── Splitter ────────────────────────────────────────────

  const shellRef = useRef<HTMLDivElement>(null);
  const clampEditor = useCallback((value: number) => {
    const total = shellRef.current?.clientWidth ?? window.innerWidth;
    return Math.round(Math.max(MIN_EDITOR, Math.min(value, total - SIDEBAR_WIDTH - MIN_PREVIEW)));
  }, []);
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const left = (shellRef.current?.getBoundingClientRect().left ?? 0) + SIDEBAR_WIDTH;
    const move = (moveEvent: PointerEvent) => setEditorWidth(clampEditor(moveEvent.clientX - left));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      setEditorWidth((value: number) => {
        writeSetting(EDITOR_WIDTH_KEY, value);
        return value;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };
  const editorColumn = editorWidth > 0 ? `${clampEditor(editorWidth)}px` : "minmax(400px, 45fr)";

  // ── Zoom ────────────────────────────────────────────────

  const stepZoom = (direction: 1 | -1) => {
    const current = zoom === "fit" ? scale : zoom;
    const next = direction > 0 ? ZOOM_STEPS.find((step) => step > current + 0.01) : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.01);
    if (next) setZoom(next);
  };

  // ── Rendering ───────────────────────────────────────────

  const statusKind = compileState === "error" ? "error" : busy ? "busy" : !compileResult ? "idle" : upToDate ? "ok" : "stale";
  const statusLabel =
    compileState === "loading"
      ? "Preparing engine…"
      : compileState === "compiling"
        ? "Compiling…"
        : compileState === "error"
          ? "Compile failed"
          : !compileResult
            ? "Not compiled"
            : upToDate
              ? `Up to date · ${(compileResult.durationMs / 1000).toFixed(1)} s`
              : autoCompile
                ? "Changes pending…"
                : "Preview out of date";

  const modalMeta: Record<ModalId, { title: string; content: ReactNode; wide?: boolean }> = {
    library: { title: "My CVs & Versions", wide: true, content: <LibraryModal library={library} workspace={workspace} /> },
    ai: {
      title: "Generate CV with AI",
      content: (
        <AiWizardModal
          workspace={workspace}
          cvName={library.active.name}
          onApply={(ws, mode) => {
            if (mode === "new") {
              const enabled = ws.languages.find((language) => language.enabled && language.document.header.name.trim());
              library.createCV(enabled ? `${enabled.document.header.name.trim()} (AI)` : "AI-generated CV", ws);
              return;
            }
            void saveVersion("Before AI import", "auto");
            history.checkpoint();
            setWorkspace(ws);
            setActiveSelection("header");
          }}
          onClose={closeModal}
        />
      )
    },
    help: { title: "Help", content: <HelpContent /> },
    license: { title: "License", content: <LicenseContent /> }
  };

  const resetToSample = async () => {
    const ok = await confirm({
      title: `Replace “${library.active.name}” with the sample CV?`,
      message: "The current content is kept as a version in “My CVs”, so you can restore it.",
      confirmLabel: "Replace with sample"
    });
    if (!ok) return;
    void saveVersion("Before reset", "auto");
    history.checkpoint();
    setWorkspace(createSampleWorkspace());
    setActiveSelection("header");
  };

  const baseName = fileBaseName(workspace, library.active.name);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-group">
          <span className="brand">CV Forge</span>
          <span className="topbar-divider" />
          <button
            className="cv-switcher"
            type="button"
            onClick={() => setActiveModal("library")}
            aria-label={`My CVs and versions (open: ${library.active.name})`}
            title="My CVs and versions"
          >
            <Library size={14} />
            <span className="cv-switcher-name">{library.active.name}</span>
            <ChevronDown size={13} />
          </button>
          <span className="save-state" title="Every change is saved in this browser">
            Saved locally
          </span>
        </div>
        <div className="topbar-group">
          <IconButton variant="ghost" label={`Undo (${MOD}Z)`} disabled={!history.canUndo} onClick={() => history.undo()}>
            <Undo2 size={15} />
          </IconButton>
          <IconButton variant="ghost" label={`Redo (${keys(`${MOD}Shift+Z`)})`} disabled={!history.canRedo} onClick={() => history.redo()}>
            <Redo2 size={15} />
          </IconButton>
          <span className="topbar-divider" />
          <button className="topbar-button topbar-button--accent" type="button" onClick={() => setActiveModal("ai")}>
            <Sparkles size={14} />
            Generate CV with AI
          </button>
          <button className="topbar-button" type="button" onClick={() => setActiveModal("help")}>
            <CircleHelp size={14} />
            Help
          </button>
          <MenuButton className="topbar-button topbar-button--icon" align="end" label={<Ellipsis size={16} aria-label="More" />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" className="menu-item menu-item--compact" onClick={() => { close(); void resetToSample(); }}>
                  <RotateCcw size={14} />
                  <span><strong>Replace with sample CV</strong></span>
                </button>
                <button type="button" role="menuitem" className="menu-item menu-item--compact" onClick={() => { close(); setActiveModal("license"); }}>
                  <Scale size={14} />
                  <span><strong>Licenses</strong></span>
                </button>
                <a className="menu-item menu-item--compact" role="menuitem" href="https://github.com/bit-admin/cv-web" target="_blank" rel="noopener noreferrer" onClick={close}>
                  <Github size={14} />
                  <span><strong>Source on GitHub</strong></span>
                </a>
              </>
            )}
          </MenuButton>
        </div>
      </header>

      <div className="workbench" ref={shellRef} style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px ${editorColumn} 0px minmax(${MIN_PREVIEW}px, 55fr)` }}>
        <Sidebar
          workspace={workspace}
          document={cvDocument}
          activeSelection={activeSelection}
          issueCounts={issueCounts}
          onSelect={setActiveSelection}
          onSelectLanguage={selectLanguage}
          onToggleLanguage={toggleLanguage}
          fontDownloads={fontDownloads}
          onAddBlock={addBlock}
          onReorder={reorderBlocks}
        />

        <main className="editor-column">
          {activeSelection === "header" && (
            <HeaderEditor document={cvDocument} onChange={(header) => updateDocument((draft) => void (draft.header = header))} />
          )}
          {activeBlock && (
            <BlockEditor
              key={`${workspace.activeLanguage}-${activeBlock.id}`}
              block={activeBlock}
              index={activeBlockIndex}
              total={cvDocument.blocks.length}
              issueCount={issueCounts.get(activeBlock.id) ?? 0}
              onShowIssues={() => {
                const first = layoutIssues.find((issue) => issueTargets.get(issue.id)?.blockId === activeBlock.id);
                if (first) selectLayoutIssue(first);
                setDockOpen(true);
              }}
              onChange={replaceBlock}
              onMove={(delta) => reorderBlocks(activeBlockIndex, activeBlockIndex + delta)}
              onDuplicate={duplicateActiveBlock}
              onDelete={deleteActiveBlock}
              onToggleHidden={toggleActiveBlockHidden}
            />
          )}
        </main>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and preview"
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={() => {
            setEditorWidth(0);
            writeSetting(EDITOR_WIDTH_KEY, 0);
          }}
        />

        <section className="preview-column" aria-label="PDF preview">
          <div className="preview-toolbar">
            <div className="toolbar-group">
              <button type="button" className="primary-button" onClick={requestCompile} disabled={busy} title={`Compile (${MOD}Enter)`}>
                <Play size={13} fill="currentColor" />
                Compile
              </button>
              <label className="mini-switch" title="Compile automatically a moment after you stop typing">
                <input
                  type="checkbox"
                  role="switch"
                  checked={autoCompile}
                  onChange={(event) => {
                    setAutoCompile(event.target.checked);
                    writeSetting(AUTO_COMPILE_KEY, event.target.checked);
                  }}
                />
                <span className="toggle-track" aria-hidden="true">
                  <span className="toggle-thumb" />
                </span>
                Auto
              </label>
              <span className={`compile-status compile-status--${statusKind}`} aria-live="polite">
                <span className="status-dot" />
                {statusLabel}
                {compileState === "loading" && download && <span aria-hidden="true">{formatDownload(download)}</span>}
              </span>
            </div>
            <div className="toolbar-group">
              <button
                type="button"
                className="secondary-button"
                title="Download the LaTeX source"
                onClick={() => downloadBlob(`${baseName}.tex`, new Blob([tex], { type: "application/x-tex" }))}
              >
                <FileCode2 size={14} />
                .tex
              </button>
              <button
                type="button"
                className="secondary-button secondary-button--strong"
                disabled={!compileResult}
                title={upToDate ? "Download the PDF" : "Download the last compiled PDF (it does not include your latest changes)"}
                onClick={() =>
                  compileResult && downloadBlob(`${baseName}.pdf`, new Blob([bytesToBlobPart(compileResult.pdf)], { type: "application/pdf" }))
                }
              >
                <Download size={14} />
                PDF
              </button>
            </div>
          </div>

          <div className="preview-stage">
          <PdfPreview
            bytes={compileResult?.pdf ?? null}
            compileState={compileState}
            download={download}
            zoom={zoom}
            showLayoutHints={showLayoutHints}
            activeIssueId={activeIssueId}
            onLayoutIssues={handleLayoutIssues}
            onSelectIssue={selectLayoutIssue}
            onPageInfo={setPageInfo}
            onScale={setScale}
            focus={previewFocus}
          />
          {pageInfo.total > 0 && (
            <div className="viewer-controls">
              <button type="button" disabled={pageInfo.current <= 1} onClick={() => scrollPreviewToPage(pageInfo.current - 1)} aria-label="Previous page" title="Previous page">
                <ChevronLeft size={14} />
              </button>
              <span className="viewer-page">
                {pageInfo.current} / {pageInfo.total}
              </span>
              <button type="button" disabled={pageInfo.current >= pageInfo.total} onClick={() => scrollPreviewToPage(pageInfo.current + 1)} aria-label="Next page" title="Next page">
                <ChevronRight size={14} />
              </button>
              <span className="viewer-sep" />
              <button type="button" onClick={() => stepZoom(-1)} aria-label="Zoom out" title="Zoom out">
                <Minus size={14} />
              </button>
              <button type="button" className="viewer-zoom" onClick={() => setZoom(zoom === "fit" ? 1 : "fit")} title={zoom === "fit" ? "Actual size" : "Fit to width"}>
                {Math.round(scale * 100)}%
              </button>
              <button type="button" onClick={() => stepZoom(1)} aria-label="Zoom in" title="Zoom in">
                <Plus size={14} />
              </button>
              <button type="button" className={`viewer-fit${zoom === "fit" ? " active" : ""}`} onClick={() => setZoom("fit")} title="Fit to width" aria-pressed={zoom === "fit"}>
                <Maximize2 size={13} />
              </button>
            </div>
          )}
          </div>

          <LayoutDock
            issues={layoutIssues}
            analysed={analysed}
            outdated={!upToDate}
            activeIssueId={activeIssueId}
            showHints={showLayoutHints}
            compileError={compileState === "error" && compileError ? compileError : null}
            expanded={dockOpen}
            onToggleExpanded={() => setDockOpen((value) => !value)}
            onToggleHints={() => setShowLayoutHints((value) => !value)}
            onSelect={selectLayoutIssue}
          />
        </section>
      </div>

      <div className="toast-region" role="status" aria-live="polite">
        {library.notice && <div className={`toast toast--${library.notice.tone}`}>{library.notice.text}</div>}
        {toast && (
          <div className="toast">
            {toast.text}
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {activeModal && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-label={modalMeta[activeModal].title}>
          <div className={`modal-content${modalMeta[activeModal].wide ? " modal-content--wide" : ""}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMeta[activeModal].title}</h2>
              <button className="modal-close" type="button" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">{modalMeta[activeModal].content}</div>
          </div>
        </div>
      )}
    </div>
  );
}
