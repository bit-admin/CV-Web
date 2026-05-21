import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Github,
  Plus,
  RefreshCcw,
  RotateCcw,
  Scale,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X
} from "lucide-react";
import { PdfPreview } from "./components/PdfPreview";
import { createEmptyBlock, createSampleWorkspace, duplicateBlock, exportWorkspaceAsAIJSON, mapAICVToWorkspace } from "./lib/document";
import { renderLatex } from "./lib/latex";
import { LatexEngineService } from "./lib/latexEngine";
import { clearStoredDocument, loadStoredWorkspace, saveStoredWorkspace } from "./lib/storage";
import { registerServiceWorker, warmCriticalAssets } from "./lib/serviceWorker";
import type {
  CompileResult,
  CompileState,
  CredentialEntry,
  CVBlock,
  CVBlockType,
  CVDocument,
  CVLanguageCode,
  CVWorkspace,
  DatedListItem,
  GroupedListItem,
  LabelValueItem,
  ProjectBlockEntry,
  RoleEntry
} from "./lib/types";

type Selection = "header" | string;

const blockTemplates: Array<{ type: CVBlockType; label: string }> = [
  { type: "credential", label: "Credential" },
  { type: "role", label: "Role" },
  { type: "project", label: "Project" },
  { type: "numbered-list", label: "Numbered list" },
  { type: "dated-list", label: "Dated list" },
  { type: "label-value-list", label: "Label values" },
  { type: "grouped-list", label: "Grouped list" },
  { type: "free-text", label: "Free text" }
];

const AI_PROMPT_TEMPLATE = `You are a CV/resume data generator for a browser-based CV builder called CV Forge.

Your task: given the user's raw CV information below, generate a complete, well-structured CV in the JSON format described. If you think you need more information from the user (e.g. missing dates, unclear job titles, incomplete education details), ask before generating — it is better to ask than to guess.

## Output Format

Wrap the final JSON in a markdown code block like this:

\`\`\`json
{ ... }
\`\`\`

Do not include any other text after the code block — just the JSON.

## JSON Structure

The top-level object has a single key "languages", where each key is a language code ("en", "zh", "ja") and each value contains a "header" and "blocks" array.

{
  "languages": {
    "en": {
      "header": {
        "name": "Full Name",
        "suffix": "Ph.D.",
        "contacts": [
          { "label": "email@example.com" },
          { "label": "(+1) 555-123-4567" },
          { "label": "linkedin.com/in/name" },
          { "label": "github.com/name" }
        ]
      },
      "blocks": [ ... ]
    }
  }
}

The "header" is per-language — the name should be in the appropriate script. For example, an English version might have "Jane Doe" while the Chinese version has "简·多".

The "blocks" array contains section blocks. Each block has a "type", a "title" (the section heading), and type-specific content fields.

## Block Types — Detailed Reference

1. "credential" — Education, degrees, certifications.
   Fields: entries[] — each entry has:
     - title: degree or credential name (e.g. "Ph.D. in Computer Science")
     - location: institution (e.g. "MIT, Cambridge, MA")
     - subtitle: extra detail (e.g. "Thesis: Efficient Algorithms for Graph Problems")
     - period: date range (e.g. "2018 - 2023")
     - bullets[]: achievements, highlights

2. "role" — Work experience, teaching positions.
   Fields: entries[] — each entry has:
     - title: job title (e.g. "Software Engineer")
     - location: company or institution (e.g. "Google, Mountain View, CA")
     - period: date range (e.g. "2023 - Present")
     - bullets[]: responsibilities and achievements

3. "project" — Research projects, side projects.
   Fields: entries[] — each entry has:
     - title: project name
     - organization: who funded or hosted it
     - period: date range
     - bullets[]: what was done, outcomes

4. "numbered-list" — Publications, working papers.
   Fields: items[] — each item is a plain string (full citation).
   Use **bold** for the author's name and _italic_ for journal/venue names.

5. "dated-list" — Awards, honors, invited talks.
   Fields: items[] — each item has:
     - text: what the award or talk is
     - date: when (e.g. "2024.06" or "2020 - 2023")

6. "label-value-list" — Skills, coursework.
   Fields: items[] — each item has:
     - label: category name (e.g. "Programming", "Languages")
     - value: comma-separated list (e.g. "Python, C++, Rust")
     - codeItems (optional): array of strings for items that should render in code style (e.g. ["Python", "C++"])

7. "grouped-list" — Academic service, committee work.
   Fields: groups[] — each group has:
     - label: role or category (e.g. "Reviewer for")
     - items[]: list of entries (e.g. ["_Mathematical Finance_", "_SIAM Review_"])

8. "free-text" — References, notes, or any unstructured text.
   Fields: text: a single string.

## Language Rules

- Decide which languages to include based on the language the user writes in:
  - Chinese input: include "en" and "zh"
  - Japanese input: include "en" and "ja"
  - English or other: include "en" only
- The user can request additional languages explicitly
- Each language version has its own header (name in appropriate script) and its own blocks (section titles and content in that language)
- Translate naturally, not literally — adapt section titles and phrasing to what is conventional in each language
- Publications and proper nouns typically stay in their original language

## Formatting Rules

- Use **double asterisks** for bold (e.g. **name** in citations)
- Use _underscores_ for italic (e.g. _journal name_)
- Use backticks for code-style text (e.g. \`Python\`)
- These are converted to LaTeX during PDF compilation

## Example

Below is a full example showing all block types. This is what a complete output looks like for an academic CV.

\`\`\`json
{
  "languages": {
    "en": {
      "header": {
        "name": "Haruka Kobayashi",
        "suffix": "Ph.D.",
        "contacts": [
          { "label": "(+1) 617-555-1948" },
          { "label": "haruka.kobayashi@northbridge.edu" },
          { "label": "https://linkedin.com/in/haruka-kobayashi" }
        ]
      },
      "blocks": [
        {
          "type": "credential",
          "title": "Education",
          "entries": [
            {
              "title": "Department of Statistics, University of Toronto",
              "location": "Toronto, Canada",
              "subtitle": "Ph.D. in Statistical Sciences",
              "period": "2018 - 2023",
              "bullets": [
                "Dissertation: _Robust Stochastic Control and Deep Hedging under Market Frictions_.",
                "Advisor: Prof. Michael R. Ellison; Committee: Prof. Laura Chen, Prof. David Stein, Prof. Keiko Watanabe.",
                "Research areas: Financial mathematics, stochastic control, quantitative risk management, machine learning for derivatives pricing."
              ]
            },
            {
              "title": "Department of Mathematics, HKUST",
              "location": "Hong Kong SAR",
              "subtitle": "M.Sc. in Financial Mathematics",
              "period": "2016 - 2018",
              "bullets": [
                "Thesis: _Numerical Methods for High-Dimensional American Option Pricing_.",
                "GPA: 3.95/4.00; graduated with Distinction."
              ]
            }
          ]
        },
        {
          "type": "numbered-list",
          "title": "Publications",
          "items": [
            "**Haruka Kobayashi**, Michael R. Ellison. Robust Deep Hedging with Proportional Transaction Costs. _Mathematical Finance_, 2025.",
            "**Haruka Kobayashi**, Laura Chen, David Stein. Distributionally Robust Pricing of Path-Dependent Derivatives under Model Ambiguity. _SIAM Journal on Financial Mathematics_, 2024.",
            "Yifan Zhou, **Haruka Kobayashi**, Michael R. Ellison. High-Dimensional Bermudan Option Pricing via Adaptive Regression Monte Carlo. _Quantitative Finance_, 2023."
          ]
        },
        {
          "type": "numbered-list",
          "title": "Working\\nPapers",
          "items": [
            "**Haruka Kobayashi**, Elena Rossi. _Market Making with Inventory Risk under Latent Liquidity Regimes_. Under review.",
            "**Haruka Kobayashi**, Samuel Kim, Priya Raman. _Calibration of Rough Volatility Models using Physics-Informed Neural Networks_. Manuscript in preparation."
          ]
        },
        {
          "type": "project",
          "title": "Research\\nProjects",
          "entries": [
            {
              "title": "Robust Deep Hedging under Market Microstructure Noise",
              "organization": "University of Toronto Quantitative Finance Lab",
              "period": "2021.09 - 2023.08",
              "bullets": [
                "Designed neural-network-based hedging strategies for incomplete markets with transaction costs, execution delays, and volatility uncertainty.",
                "Developed a simulation framework for comparing classical delta hedging, utility-based hedging, and deep reinforcement learning approaches.",
                "Reduced out-of-sample hedging shortfall by 18% relative to benchmark regression-based strategies in synthetic limit-order-book environments."
              ]
            }
          ]
        },
        {
          "type": "role",
          "title": "Professional\\nExperience",
          "entries": [
            {
              "title": "Asteria Capital Management",
              "location": "New York, USA",
              "period": "2023.09 - Present",
              "bullets": [
                "Quantitative Researcher, Systematic Strategies Team.",
                "Develop factor models for equity index futures and cross-asset volatility strategies using statistical learning and stochastic filtering methods.",
                "Built production-grade Python libraries for volatility surface construction, scenario generation, and portfolio stress testing.",
                "Collaborated with traders and engineers to deploy intraday risk dashboards covering approximately USD 3.2B in notional exposure."
              ]
            },
            {
              "title": "RBC Capital Markets",
              "location": "Toronto, Canada",
              "period": "2021.05 - 2021.09",
              "bullets": [
                "Quantitative Research Intern, Equity Derivatives Analytics.",
                "Improved calibration routines for local-stochastic volatility models using adjoint algorithmic differentiation."
              ]
            }
          ]
        },
        {
          "type": "role",
          "title": "Teaching",
          "entries": [
            {
              "title": "University of Toronto",
              "location": "Toronto, Canada",
              "period": "2019 - 2023",
              "bullets": [
                "Teaching Assistant: Mathematical Finance, Stochastic Processes, Statistical Learning, Time Series Analysis.",
                "Received departmental teaching evaluation score of 4.8/5.0 across six semesters."
              ]
            }
          ]
        },
        {
          "type": "dated-list",
          "title": "Awards\\nand\\nHonors",
          "items": [
            { "text": "Rising Star in Quantitative Finance, North American Quantitative Finance Association", "date": "2025.03" },
            { "text": "Best Dissertation Award, Department of Statistical Sciences, University of Toronto", "date": "2023.06" },
            { "text": "Alexander Graham Bell Canada Graduate Scholarship, NSERC", "date": "2020 - 2023" },
            { "text": "Best Student Paper, SIAM Conference on Financial Mathematics and Engineering", "date": "2021.06" }
          ]
        },
        {
          "type": "dated-list",
          "title": "Invited\\nTalks",
          "items": [
            { "text": "Robust Deep Hedging in Incomplete Markets, Columbia Financial Engineering Seminar", "date": "2025.02" },
            { "text": "Learning-Based Methods for Derivatives Pricing, MIT Operations Research Center Seminar", "date": "2024.11" },
            { "text": "Neural Stochastic Control with Market Frictions, SIAM Conference on Financial Mathematics and Engineering", "date": "2023.07" }
          ]
        },
        {
          "type": "label-value-list",
          "title": "Skills",
          "items": [
            { "label": "Research", "value": "Stochastic calculus, stochastic control, martingale methods, derivatives pricing, risk measures, portfolio optimization" },
            { "label": "Programming", "value": "", "codeItems": ["Python", "C++", "R", "MATLAB", "Julia", "SQL"] },
            { "label": "Libraries", "value": "NumPy, SciPy, pandas, PyTorch, TensorFlow, JAX, scikit-learn, QuantLib, CVXPY" },
            { "label": "Tools", "value": "Git, Linux, Docker, Bloomberg Terminal, Refinitiv Eikon, LaTeX, Slurm, AWS EC2" },
            { "label": "Languages", "value": "Japanese native; English fluent; Mandarin conversational" }
          ]
        },
        {
          "type": "grouped-list",
          "title": "Academic\\nServices",
          "groups": [
            {
              "label": "Reviewer for",
              "items": [
                "_Mathematical Finance_",
                "_SIAM Journal on Financial Mathematics_",
                "_Quantitative Finance_",
                "_Operations Research_"
              ]
            },
            { "label": "Organizer", "items": ["Junior Quantitative Finance Reading Group, University of Toronto"] },
            { "label": "Mentor", "items": ["Women in Mathematics Graduate Mentorship Program"] }
          ]
        },
        {
          "type": "label-value-list",
          "title": "Selected\\nCoursework",
          "items": [
            { "label": "Mathematics", "value": "Measure Theory, Functional Analysis, Probability Theory, Partial Differential Equations, Numerical Analysis" },
            { "label": "Finance", "value": "Derivatives Pricing, Fixed Income Models, Credit Risk, Market Risk, Algorithmic Trading, Portfolio Theory" },
            { "label": "Statistics and Machine Learning", "value": "Statistical Inference, Bayesian Methods, Time Series, Reinforcement Learning, Deep Learning" }
          ]
        },
        {
          "type": "free-text",
          "title": "References",
          "text": "Available upon request."
        }
      ]
    }
  }
}
\`\`\`

## User's CV Information

[Paste your CV details, career summary, or any information here. You can be informal — bullet points, rough notes, or even a LinkedIn URL are all fine.]

---

Generate the CV JSON now. Remember: wrap it in a \`\`\`json code block. If you need more details, ask first.`;

const blockTypeLabels: Record<CVBlockType, string> = {
  credential: "Credential",
  role: "Role",
  project: "Project",
  "numbered-list": "Numbered list",
  "dated-list": "Dated list",
  "label-value-list": "Label values",
  "grouped-list": "Grouped list",
  "free-text": "Free text"
};

function cloneSample(): CVWorkspace {
  return createSampleWorkspace();
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 3,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function IconButton({
  label,
  onClick,
  variant = "default",
  disabled = false,
  children
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`icon-button${variant === "danger" ? " icon-button--danger" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AiWizardModal({
  workspace,
  onApply,
  onClose
}: {
  workspace: CVWorkspace;
  onApply: (workspace: CVWorkspace) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.name.endsWith(".json")) {
      file.text().then((text) => setJsonInput(text));
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable; user can copy manually
    }
  }, []);

  const handleExport = useCallback(() => {
    const json = exportWorkspaceAsAIJSON(workspace);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cv.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [workspace]);

  const handleApply = useCallback(() => {
    setError(null);
    const trimmed = jsonInput.trim();
    if (!trimmed) {
      setError("Please paste the JSON from your AI assistant.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setError("Invalid JSON. Make sure you copied the complete output from the AI.");
      return;
    }

    const result = mapAICVToWorkspace(parsed);
    if (typeof result === "string") {
      setError(result);
      return;
    }

    onApply(result);
    onClose();
  }, [jsonInput, onApply, onClose]);

  return (
    <>
      <div className="wizard-step-indicator">
        <span className={step === 1 ? "active" : ""}>1. Copy Prompt</span>
        <span className="step-separator" />
        <span className={step === 2 ? "active" : ""}>2. Paste JSON</span>
      </div>

      {step === 1 ? (
        <>
          <p className="wizard-instructions">
            Copy the prompt below and paste it into ChatGPT, Claude, or any AI
            assistant. Add your CV details where indicated. The AI may ask
            follow-up questions if it needs more info — answer them, then copy
            the JSON from the code block it produces.
          </p>
          <pre className="wizard-prompt-block">{AI_PROMPT_TEMPLATE}</pre>
          <div className="wizard-actions">
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className={`wizard-copy-btn${copied ? " copied" : ""}`}
                type="button"
                onClick={handleCopy}
              >
                <Copy size={14} />
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                className="wizard-copy-btn"
                type="button"
                onClick={handleExport}
              >
                <Download size={14} />
                Export Current CV
              </button>
            </div>
            <div className="wizard-actions-right">
              <button
                className="primary-button"
                type="button"
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="wizard-instructions">
            Drop a JSON file below, or paste the JSON from the AI's code block
            (just the JSON, no backticks). This will replace your entire CV
            workspace.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div
            className={`wizard-dropzone${dragging ? " wizard-dropzone--active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={14} />
            <span>Drop .json file here or click to select</span>
          </div>
          <textarea
            className="wizard-textarea"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="...or paste the AI-generated JSON here"
            spellCheck={false}
          />
          {error && (
            <div className="wizard-error" role="alert">
              {error}
            </div>
          )}
          <div className="wizard-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <div className="wizard-actions-right">
              <button
                className="primary-button"
                type="button"
                disabled={!jsonInput.trim()}
                onClick={handleApply}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function TextListEditor({
  title,
  itemLabel,
  values,
  onChange,
  rows = 2,
  placeholder
}: {
  title: string;
  itemLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="editor-block">
      <SectionHeader
        title={title}
        action={
          <IconButton label={`Add ${itemLabel}`} onClick={() => onChange([...values, ""])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {values.map((value, index) => (
        <div className="row-editor compact" key={`${title}-${index}`}>
          <Area
            label={`${itemLabel} ${index + 1}`}
            value={value}
            rows={rows}
            placeholder={placeholder}
            onChange={(next) => onChange(values.map((item, itemIndex) => (itemIndex === index ? next : item)))}
          />
          <IconButton
            label={`Remove ${itemLabel} ${index + 1}`}
            variant="danger"
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function BulletEditor({
  bullets,
  onChange
}: {
  bullets: string[];
  onChange: (bullets: string[]) => void;
}) {
  return (
    <div className="bullet-list">
      {bullets.map((bullet, index) => (
        <div className="row-editor compact" key={`bullet-${index}`}>
          <Area
            label={`Bullet ${index + 1}`}
            value={bullet}
            rows={2}
            placeholder="Achievement, responsibility, or detail"
            onChange={(next) =>
              onChange(bullets.map((item, itemIndex) => (itemIndex === index ? next : item)))
            }
          />
          <IconButton
            label={`Remove bullet ${index + 1}`}
            variant="danger"
            onClick={() => onChange(bullets.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      <button className="text-button" type="button" onClick={() => onChange([...bullets, ""])}>
        <Plus size={14} />
        Add bullet
      </button>
    </div>
  );
}

function CredentialEntriesEditor({
  entries,
  onChange
}: {
  entries: CredentialEntry[];
  onChange: (entries: CredentialEntry[]) => void;
}) {
  const emptyEntry: CredentialEntry = { title: "", location: "", subtitle: "", period: "", bullets: [""] };

  return (
    <div className="editor-block">
      <SectionHeader
        title="Entries"
        action={
          <IconButton label="Add credential" onClick={() => onChange([...entries, emptyEntry])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {entries.map((entry, index) => (
        <div className="entry-panel" key={`credential-${index}`}>
          <div className="entry-title-row">
            <h3>{entry.title || `Credential ${index + 1}`}</h3>
            <IconButton
              label={`Remove credential ${index + 1}`}
              variant="danger"
              onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
          <div className="field-grid">
            <Field
              label="Title"
              value={entry.title}
              placeholder="Institution or department"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, title: value } : item)))
              }
            />
            <Field
              label="Location"
              value={entry.location}
              placeholder="City, country"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, location: value } : item)))
              }
            />
            <Field
              label="Subtitle"
              value={entry.subtitle}
              placeholder="Degree, role, or subtitle"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, subtitle: value } : item)))
              }
            />
            <Field
              label="Period"
              value={entry.period}
              placeholder="2020 - 2024"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, period: value } : item)))
              }
            />
          </div>
          <BulletEditor
            bullets={entry.bullets}
            onChange={(bullets) =>
              onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, bullets } : item)))
            }
          />
        </div>
      ))}
    </div>
  );
}

function RoleEntriesEditor({
  entries,
  onChange
}: {
  entries: RoleEntry[];
  onChange: (entries: RoleEntry[]) => void;
}) {
  const emptyEntry: RoleEntry = { title: "", location: "", period: "", bullets: [""] };

  return (
    <div className="editor-block">
      <SectionHeader
        title="Entries"
        action={
          <IconButton label="Add role" onClick={() => onChange([...entries, emptyEntry])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {entries.map((entry, index) => (
        <div className="entry-panel" key={`role-${index}`}>
          <div className="entry-title-row">
            <h3>{entry.title || `Role ${index + 1}`}</h3>
            <IconButton
              label={`Remove role ${index + 1}`}
              variant="danger"
              onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
          <div className="field-grid">
            <Field
              label="Title"
              value={entry.title}
              placeholder="Organization or role"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, title: value } : item)))
              }
            />
            <Field
              label="Location"
              value={entry.location}
              placeholder="City, country"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, location: value } : item)))
              }
            />
            <Field
              label="Period"
              value={entry.period}
              placeholder="2023 - Present"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, period: value } : item)))
              }
            />
          </div>
          <BulletEditor
            bullets={entry.bullets}
            onChange={(bullets) =>
              onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, bullets } : item)))
            }
          />
        </div>
      ))}
    </div>
  );
}

function ProjectEntriesEditor({
  entries,
  onChange
}: {
  entries: ProjectBlockEntry[];
  onChange: (entries: ProjectBlockEntry[]) => void;
}) {
  const emptyEntry: ProjectBlockEntry = { title: "", organization: "", period: "", bullets: [""] };

  return (
    <div className="editor-block">
      <SectionHeader
        title="Entries"
        action={
          <IconButton label="Add project" onClick={() => onChange([...entries, emptyEntry])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {entries.map((entry, index) => (
        <div className="entry-panel" key={`project-${index}`}>
          <div className="entry-title-row">
            <h3>{entry.title || `Project ${index + 1}`}</h3>
            <IconButton
              label={`Remove project ${index + 1}`}
              variant="danger"
              onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
          <div className="field-grid">
            <Field
              label="Title"
              value={entry.title}
              placeholder="Project title"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, title: value } : item)))
              }
            />
            <Field
              label="Context"
              value={entry.organization}
              placeholder="Lab, company, or organization"
              onChange={(value) =>
                onChange(
                  entries.map((item, itemIndex) => (itemIndex === index ? { ...item, organization: value } : item))
                )
              }
            />
            <Field
              label="Period"
              value={entry.period}
              placeholder="2021.09 - 2023.08"
              onChange={(value) =>
                onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, period: value } : item)))
              }
            />
          </div>
          <BulletEditor
            bullets={entry.bullets}
            onChange={(bullets) =>
              onChange(entries.map((item, itemIndex) => (itemIndex === index ? { ...item, bullets } : item)))
            }
          />
        </div>
      ))}
    </div>
  );
}

function DatedListEditor({
  items,
  onChange
}: {
  items: DatedListItem[];
  onChange: (items: DatedListItem[]) => void;
}) {
  return (
    <div className="editor-block">
      <SectionHeader
        title="Items"
        action={
          <IconButton label="Add dated item" onClick={() => onChange([...items, { text: "", date: "" }])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {items.map((item, index) => (
        <div className="row-editor" key={`dated-${index}`}>
          <Field
            label="Text"
            value={item.text}
            placeholder="Award, talk, or honor"
            onChange={(value) =>
              onChange(items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, text: value } : entry)))
            }
          />
          <Field
            label="Date"
            value={item.date}
            placeholder="2024.06"
            onChange={(value) =>
              onChange(items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, date: value } : entry)))
            }
          />
          <IconButton
            label={`Remove item ${index + 1}`}
            variant="danger"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function LabelValueListEditor({
  items,
  onChange
}: {
  items: LabelValueItem[];
  onChange: (items: LabelValueItem[]) => void;
}) {
  const editableValue = (item: LabelValueItem) =>
    item.codeItems?.length ? item.codeItems.map((codeItem) => `\`${codeItem}\``).join(", ") : item.value;

  return (
    <div className="editor-block">
      <SectionHeader
        title="Items"
        action={
          <IconButton label="Add label value" onClick={() => onChange([...items, { label: "", value: "" }])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {items.map((item, index) => (
        <div className="entry-panel" key={`label-value-${index}`}>
          <div className="entry-title-row">
            <h3>{item.label || `Item ${index + 1}`}</h3>
            <IconButton
              label={`Remove item ${index + 1}`}
              variant="danger"
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
          <Field
            label="Label"
            value={item.label}
            placeholder="Research, Programming, Languages"
            onChange={(value) =>
              onChange(items.map((entry, itemIndex) => (itemIndex === index ? { ...entry, label: value } : entry)))
            }
          />
          <Area
            label="Value"
            value={editableValue(item)}
            rows={2}
            placeholder="Use `Python` for code-style items"
            onChange={(value) =>
              onChange(
                items.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, value, codeItems: undefined } : entry
                )
              )
            }
          />
        </div>
      ))}
    </div>
  );
}

function GroupedListEditor({
  groups,
  onChange
}: {
  groups: GroupedListItem[];
  onChange: (groups: GroupedListItem[]) => void;
}) {
  return (
    <div className="editor-block">
      <SectionHeader
        title="Groups"
        action={
          <IconButton label="Add group" onClick={() => onChange([...groups, { label: "", items: [""] }])}>
            <Plus size={14} />
          </IconButton>
        }
      />
      {groups.map((group, index) => (
        <div className="entry-panel" key={`group-${index}`}>
          <div className="entry-title-row">
            <h3>{group.label || `Group ${index + 1}`}</h3>
            <IconButton
              label={`Remove group ${index + 1}`}
              variant="danger"
              onClick={() => onChange(groups.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
          <Field
            label="Label"
            value={group.label}
            placeholder="Reviewer for, Organizer, Mentor"
            onChange={(value) =>
              onChange(groups.map((entry, itemIndex) => (itemIndex === index ? { ...entry, label: value } : entry)))
            }
          />
          <TextListEditor
            title="Group items"
            itemLabel="Item"
            values={group.items}
            placeholder="List item"
            onChange={(items) =>
              onChange(groups.map((entry, itemIndex) => (itemIndex === index ? { ...entry, items } : entry)))
            }
          />
        </div>
      ))}
    </div>
  );
}

function LanguageNavigator({
  workspace,
  onSelect,
  onToggle
}: {
  workspace: CVWorkspace;
  onSelect: (code: CVLanguageCode) => void;
  onToggle: (code: CVLanguageCode) => void;
}) {
  const enabledCount = workspace.languages.filter((language) => language.enabled).length;

  return (
    <div className="language-navigator">
      <SectionHeader title="Languages" />
      <div className="language-list">
        {workspace.languages.map((language) => {
          const isActive = workspace.activeLanguage === language.code;
          const cannotDisable = language.enabled && enabledCount === 1;

          return (
            <div
              className={`language-row${isActive ? " active" : ""}${language.enabled ? "" : " muted"}`}
              key={language.code}
            >
              <button className="language-select" type="button" onClick={() => onSelect(language.code)}>
                <strong>{language.label}</strong>
                <span>{language.enabled ? "ENABLED" : "DISABLED"}</span>
              </button>
              <label className="language-toggle" title={`${language.label} export enabled`}>
                <input
                  type="checkbox"
                  checked={language.enabled}
                  disabled={cannotDisable}
                  aria-label={`${language.label} export enabled`}
                  onChange={() => onToggle(language.code)}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentOutline({
  document,
  workspace,
  activeSelection,
  onSelect,
  onSelectLanguage,
  onToggleLanguage,
  onAddBlock
}: {
  document: CVDocument;
  workspace: CVWorkspace;
  activeSelection: Selection;
  onSelect: (selection: Selection) => void;
  onSelectLanguage: (code: CVLanguageCode) => void;
  onToggleLanguage: (code: CVLanguageCode) => void;
  onAddBlock: (type: CVBlockType) => void;
}) {
  return (
    <aside className="outline-pane">
      <LanguageNavigator workspace={workspace} onSelect={onSelectLanguage} onToggle={onToggleLanguage} />
      <div className="outline-scroll">
        <SectionHeader title="Document" />
        <button
          className={`outline-item${activeSelection === "header" ? " active" : ""}`}
          type="button"
          onClick={() => onSelect("header")}
        >
          <strong>Header</strong>
          <span>HEADER</span>
        </button>
        {document.blocks.map((block, index) => (
          <button
            className={`outline-item${activeSelection === block.id ? " active" : ""}${block.hidden ? " muted" : ""}`}
            type="button"
            key={block.id}
            onClick={() => onSelect(block.id)}
          >
            <strong>{block.title || `Section ${index + 1}`}</strong>
            <span>{blockTypeLabels[block.type].toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="template-picker">
        <SectionHeader title="Add block" />
        <div className="template-grid">
          {blockTemplates.map((template) => (
            <button key={template.type} type="button" onClick={() => onAddBlock(template.type)}>
              <Plus size={13} />
              {template.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function HeaderEditor({
  document,
  onChange
}: {
  document: CVDocument;
  onChange: (next: CVDocument["header"]) => void;
}) {
  return (
    <div className="block-editor">
      <div className="block-editor-header">
        <div>
          <span className="block-kicker">Header</span>
          <h2>{document.header.name || "Header"}</h2>
        </div>
      </div>
      <div className="editor-scroll editor-scroll--block">
        <div className="editor-block">
          <SectionHeader title="Identity" />
          <div className="field-grid">
            <Field
              label="Name"
              value={document.header.name}
              placeholder="Full name"
              onChange={(name) => onChange({ ...document.header, name })}
            />
            <Field
              label="Suffix"
              value={document.header.suffix}
              placeholder="Ph.D."
              onChange={(suffix) => onChange({ ...document.header, suffix })}
            />
          </div>
        </div>
        <TextListEditor
          title="Contact"
          itemLabel="Contact"
          values={document.header.contacts}
          rows={1}
          placeholder="Phone, email, or URL"
          onChange={(contacts) => onChange({ ...document.header, contacts })}
        />
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onToggleHidden
}: {
  block: CVBlock;
  index: number;
  total: number;
  onChange: (block: CVBlock) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  return (
    <div className="block-editor">
      <div className="block-editor-header">
        <div>
          <span className="block-kicker">{blockTypeLabels[block.type]}</span>
          <h2>{block.title || "Untitled block"}</h2>
        </div>
        <div className="block-actions">
          <IconButton label="Move block up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp size={14} />
          </IconButton>
          <IconButton label="Move block down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown size={14} />
          </IconButton>
          <IconButton label={block.hidden ? "Show block" : "Hide block"} onClick={onToggleHidden}>
            {block.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </IconButton>
          <IconButton label="Duplicate block" onClick={onDuplicate}>
            <Copy size={14} />
          </IconButton>
          <IconButton label="Delete block" variant="danger" onClick={onDelete}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="editor-scroll editor-scroll--block">
        <div className="editor-block">
          <SectionHeader title="Section" />
          <Area
            label="Title"
            value={block.title}
            rows={2}
            placeholder="Section title"
            onChange={(title) => onChange({ ...block, title })}
          />
        </div>

        {block.type === "credential" && (
          <CredentialEntriesEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />
        )}
        {block.type === "role" && (
          <RoleEntriesEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />
        )}
        {block.type === "project" && (
          <ProjectEntriesEditor entries={block.entries} onChange={(entries) => onChange({ ...block, entries })} />
        )}
        {block.type === "numbered-list" && (
          <TextListEditor
            title="Items"
            itemLabel="Item"
            values={block.items}
            rows={3}
            placeholder="Author(s). Title. Venue, year."
            onChange={(items) => onChange({ ...block, items })}
          />
        )}
        {block.type === "dated-list" && (
          <DatedListEditor items={block.items} onChange={(items) => onChange({ ...block, items })} />
        )}
        {block.type === "label-value-list" && (
          <LabelValueListEditor items={block.items} onChange={(items) => onChange({ ...block, items })} />
        )}
        {block.type === "grouped-list" && (
          <GroupedListEditor groups={block.groups} onChange={(groups) => onChange({ ...block, groups })} />
        )}
        {block.type === "free-text" && (
          <div className="editor-block">
            <SectionHeader title="Text" />
            <Area
              label="Text"
              value={block.text}
              rows={4}
              placeholder="Available upon request."
              onChange={(text) => onChange({ ...block, text })}
            />
          </div>
        )}
      </div>
    </div>
  );
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

function statusText(state: CompileState, result: CompileResult | null): string {
  if (state === "loading") return "Loading engine…";
  if (state === "compiling") return "Compiling…";
  if (state === "ready" && result) return `${result.durationMs}ms`;
  if (state === "error") return "Error";
  return "Idle";
}

export function App() {
  const engineRef = useRef<LatexEngineService | null>(null);
  const bootedRef = useRef(false);
  const [workspace, setWorkspace] = useState<CVWorkspace>(() => loadStoredWorkspace() ?? cloneSample());
  const [activeSelection, setActiveSelection] = useState<Selection>("header");
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compileLog, setCompileLog] = useState("");
  const [activeModal, setActiveModal] = useState<null | "ai" | "format" | "license">(null);
  const closeModal = useCallback(() => setActiveModal(null), []);

  useEffect(() => {
    if (!activeModal) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeModal, closeModal]);

  const modalMeta: Record<"ai" | "format" | "license", { title: string; content: ReactNode }> = {
    ai: {
      title: "Generate CV with AI",
      content: (
        <AiWizardModal
          workspace={workspace}
          onApply={(ws) => setWorkspace(ws)}
          onClose={closeModal}
        />
      ),
    },
    format: {
      title: "Formatting Help",
      content: (
        <>
          <p>Use the following Markdown-style syntax to format your CV content:</p>
          <dl className="format-help-list">
            <dt>**double asterisks**</dt>
            <dd><strong>Bold text</strong></dd>
            <dt>_underscores_</dt>
            <dd><em>Italic text</em></dd>
            <dt>`backticks`</dt>
            <dd><code>Code-style text</code> (e.g. <code>Python</code>, <code>LaTeX</code>)</dd>
          </dl>
          <p className="format-help-note">
            These formatting markers are converted to their LaTeX equivalents during compilation.
          </p>
        </>
      ),
    },
    license: {
      title: "License",
      content: (
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
      ),
    },
  };

  const activeLanguage = workspace.languages.find((language) => language.code === workspace.activeLanguage) ?? workspace.languages[0];
  const cvDocument = activeLanguage.document;
  const tex = useMemo(() => renderLatex(workspace), [workspace]);
  const activeBlock = activeSelection === "header" ? null : cvDocument.blocks.find((block) => block.id === activeSelection) ?? null;
  const activeBlockIndex = activeBlock ? cvDocument.blocks.findIndex((block) => block.id === activeBlock.id) : -1;

  useEffect(() => {
    saveStoredWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    if (activeSelection !== "header" && !cvDocument.blocks.some((block) => block.id === activeSelection)) {
      setActiveSelection(cvDocument.blocks[0]?.id ?? "header");
    }
  }, [activeSelection, cvDocument.blocks]);

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

  const selectLanguage = useCallback(
    (code: CVLanguageCode) => {
      updateWorkspace((draft) => {
        draft.activeLanguage = code;
      });
    },
    [updateWorkspace]
  );

  const toggleLanguage = useCallback(
    (code: CVLanguageCode) => {
      updateWorkspace((draft) => {
        const language = draft.languages.find((item) => item.code === code);
        if (!language) {
          return;
        }

        if (language.enabled && draft.languages.filter((item) => item.enabled).length === 1) {
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
        if (index >= 0) {
          draft.blocks[index] = nextBlock;
        }
      });
    },
    [updateDocument]
  );

  const addBlock = useCallback(
    (type: CVBlockType) => {
      const block = createEmptyBlock(type);
      updateDocument((draft) => {
        draft.blocks.push(block);
      });
      setActiveSelection(block.id);
    },
    [updateDocument]
  );

  const moveActiveBlock = useCallback(
    (delta: -1 | 1) => {
      if (!activeBlock) {
        return;
      }
      updateDocument((draft) => {
        const index = draft.blocks.findIndex((block) => block.id === activeBlock.id);
        const nextIndex = index + delta;
        if (index < 0 || nextIndex < 0 || nextIndex >= draft.blocks.length) {
          return;
        }
        const [block] = draft.blocks.splice(index, 1);
        draft.blocks.splice(nextIndex, 0, block);
      });
    },
    [activeBlock, updateDocument]
  );

  const duplicateActiveBlock = useCallback(() => {
    if (!activeBlock) {
      return;
    }
    const copy = duplicateBlock(activeBlock);
    updateDocument((draft) => {
      const index = draft.blocks.findIndex((block) => block.id === activeBlock.id);
      draft.blocks.splice(index + 1, 0, copy);
    });
    setActiveSelection(copy.id);
  }, [activeBlock, updateDocument]);

  const deleteActiveBlock = useCallback(() => {
    if (!activeBlock) {
      return;
    }
    const nextSelection = cvDocument.blocks[activeBlockIndex + 1]?.id ?? cvDocument.blocks[activeBlockIndex - 1]?.id ?? "header";
    updateDocument((draft) => {
      draft.blocks = draft.blocks.filter((block) => block.id !== activeBlock.id);
    });
    setActiveSelection(nextSelection);
  }, [activeBlock, activeBlockIndex, cvDocument.blocks, updateDocument]);

  const toggleActiveBlockHidden = useCallback(() => {
    if (!activeBlock) {
      return;
    }
    updateDocument((draft) => {
      const block = draft.blocks.find((item) => item.id === activeBlock.id);
      if (block) {
        block.hidden = !block.hidden;
      }
    });
  }, [activeBlock, updateDocument]);

  const compile = useCallback(async () => {
    const engine = engineRef.current ?? new LatexEngineService();
    engineRef.current = engine;
    setCompileState("compiling");
    setCompileResult(null);
    setCompileLog("");

    try {
      const result = await engine.compile(tex);
      setCompileResult(result);
      setCompileLog(result.log);
      setCompileState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCompileLog(message);
      setCompileState("error");
    }
  }, [tex]);

  useEffect(() => {
    if (bootedRef.current) {
      return;
    }
    bootedRef.current = true;

    async function boot() {
      setCompileState("loading");
      await registerServiceWorker();
      await warmCriticalAssets();
      await compile();
    }

    boot().catch((error) => {
      setCompileState("error");
      setCompileLog(error instanceof Error ? error.message : String(error));
    });

    return () => engineRef.current?.close();
  }, [compile]);

  return (
    <main className="app-shell">
      <aside className="editor-pane">
        <header className="app-header">
          <div className="brand-lockup">
            <h1>CV Forge</h1>
            <nav className="header-actions" aria-label="Quick actions">
              <button
                className="header-action-btn"
                type="button"
                onClick={() => setActiveModal("ai")}
                aria-label="Generate CV with AI"
              >
                <Sparkles size={14} />
                <span>Generate CV with AI</span>
              </button>
              <button
                className="header-action-btn"
                type="button"
                onClick={() => setActiveModal("format")}
                aria-label="Formatting help"
              >
                <Type size={14} />
                <span>Formatting Help</span>
              </button>
              <button
                className="header-action-btn"
                type="button"
                onClick={() => setActiveModal("license")}
                aria-label="License information"
              >
                <Scale size={14} />
                <span>License</span>
              </button>
              <a
                className="header-action-btn"
                href="https://github.com/bit-admin/cv-web"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
              >
                <Github size={14} />
                <span>GitHub</span>
              </a>
            </nav>
          </div>
          <span className={`status-pill ${compileState}`}>{statusText(compileState, compileResult)}</span>
        </header>

        <div className="editor-workspace">
          <DocumentOutline
            document={cvDocument}
            workspace={workspace}
            activeSelection={activeSelection}
            onSelect={setActiveSelection}
            onSelectLanguage={selectLanguage}
            onToggleLanguage={toggleLanguage}
            onAddBlock={addBlock}
          />
          {activeSelection === "header" && (
            <HeaderEditor
              document={cvDocument}
              onChange={(header) => updateDocument((draft) => void (draft.header = header))}
            />
          )}
          {activeBlock && (
            <BlockEditor
              block={activeBlock}
              index={activeBlockIndex}
              total={cvDocument.blocks.length}
              onChange={replaceBlock}
              onMove={moveActiveBlock}
              onDuplicate={duplicateActiveBlock}
              onDelete={deleteActiveBlock}
              onToggleHidden={toggleActiveBlockHidden}
            />
          )}
        </div>
      </aside>

      <section className="preview-pane">
        <div className="command-bar">
          <button type="button" className="primary-button" onClick={compile} disabled={compileState === "compiling"}>
            <RefreshCcw size={15} />
            Compile
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadBlob("cv.tex", new Blob([tex], { type: "application/x-tex" }))}
          >
            <FileText size={15} />
            .tex
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!compileResult}
            onClick={() =>
              compileResult &&
              downloadBlob("cv.pdf", new Blob([bytesToBlobPart(compileResult.pdf)], { type: "application/pdf" }))
            }
          >
            <Download size={15} />
            .pdf
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              clearStoredDocument();
              setWorkspace(cloneSample());
              setActiveSelection("header");
              setCompileResult(null);
              setCompileLog("");
              setCompileState("idle");
            }}
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>

        {compileState === "error" && (
          <pre className="compile-log" aria-live="polite">
            {compileLog}
          </pre>
        )}

        <PdfPreview bytes={compileResult?.pdf ?? null} compileState={compileState} />
      </section>

      {activeModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={modalMeta[activeModal].title}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMeta[activeModal].title}</h2>
              <button
                className="modal-close"
                type="button"
                onClick={closeModal}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {modalMeta[activeModal].content}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
