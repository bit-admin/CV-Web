import { useCallback, useRef, useState } from "react";
import { Copy, Download, FilePlus2, Upload } from "lucide-react";
import { exportWorkspaceAsAIJSON, mapAICVToWorkspace } from "../lib/document";
import type { CVWorkspace } from "../lib/types";

const AI_PROMPT_TEMPLATE = `You are a CV/resume data generator for a browser-based CV builder called CV Forge.

Your task: given the user's raw CV information below, generate a complete, well-structured CV in the JSON format described. If you need more information from the user (e.g. missing dates, unclear job titles, incomplete education details), ask before generating — do not guess or fill in facts. Leave a field empty or omit an optional item rather than inventing a date, title, location, employer, degree, or publication.

## Output Format

Reply in this exact order:

1. Generate the complete CV data wrapped in a single markdown code block. Put only valid JSON inside the fence — no commentary, no trailing commas:

\`\`\`json
{ ... }
\`\`\`

2. Immediately after the code block, tell the user how to copy it into CV Forge. Use wording like:
   "You can copy the JSON above using the copy button in the top-right corner of the code block, then paste it into CV Forge (step 2 of the AI wizard)."

3. If anything is still uncertain, or if you inferred something non-factual (section grouping, heading wording, translation choices), briefly mention it so the user can verify or correct it. If nothing was inferred, omit this section. Do not use this section as a license to invent missing facts.

Do not put the copy instruction or assumptions inside the JSON. Do not add a second JSON block.

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

---

## User's CV Information

[Paste your CV details, career summary, or any information here. You can be informal — bullet points, rough notes, or even a LinkedIn URL are all fine.]
`;

export type ApplyMode = "replace" | "new";

export function AiWizardModal({
  workspace,
  cvName,
  onApply,
  onClose
}: {
  workspace: CVWorkspace;
  cvName: string;
  onApply: (workspace: CVWorkspace, mode: ApplyMode) => void;
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

  const handleApply = useCallback((mode: ApplyMode) => {
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

    onApply(result, mode);
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
            the JSON from its code block (copy button, top-right) and paste it
            in the next step.
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
            (just the JSON, no backticks). Then create a new CV from it, or
            replace the open CV (its current content is kept as a version in
            “My CVs”).
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
                className="secondary-button"
                type="button"
                disabled={!jsonInput.trim()}
                title="Add the result to “My CVs” as a new CV and open it"
                onClick={() => handleApply("new")}
              >
                <FilePlus2 size={14} />
                Create as new CV
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!jsonInput.trim()}
                title={`Replace the content of “${cvName}” (its current state is kept as a version)`}
                onClick={() => handleApply("replace")}
              >
                Replace<span className="button-name">“{cvName}”</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
