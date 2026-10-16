import { useState } from "react";
import { Check } from "lucide-react";
import { TEMPLATES, type CVTemplate } from "../lib/templates";
import type { CVLanguageCode, CVTemplateId } from "../lib/types";

// First page of the sample CV in each template and language (npm run thumbnails).
const thumbnailUrls = import.meta.glob<string>("../assets/thumbnails/*.webp", { eager: true, query: "?url", import: "default" });

export function templateThumbnail(id: CVTemplateId, language: CVLanguageCode): string | undefined {
  return thumbnailUrls[`../assets/thumbnails/${id}-${language}.webp`] ?? thumbnailUrls[`../assets/thumbnails/${id}-en.webp`];
}

/** The sidebar's current-template row; opens the picker. */
export function TemplateSummary({ template, language, onChange }: { template: CVTemplate; language: CVLanguageCode; onChange: () => void }) {
  return (
    <button type="button" className="template-summary" onClick={onChange} title="Choose a template">
      <img className="template-summary-thumb" src={templateThumbnail(template.id, language)} alt="" />
      <span className="template-summary-text">
        <strong>{template.name}</strong>
        <small>Change template</small>
      </span>
    </button>
  );
}

type TemplatePickerProps = {
  current: CVTemplateId;
  /** Thumbnails show the sample CV in this language. */
  language: CVLanguageCode;
  onChoose: (id: CVTemplateId) => void;
  onClose: () => void;
};

export function TemplatePicker({ current, language, onChoose, onClose }: TemplatePickerProps) {
  const [selected, setSelected] = useState<CVTemplateId>(current);
  const selectedTemplate = TEMPLATES.find((template) => template.id === selected) ?? TEMPLATES[0];
  return (
    <div className="template-picker">
      <p className="template-picker-note">Your content stays the same in every template. You can switch back at any time, or undo.</p>
      <div className="template-grid" role="radiogroup" aria-label="Templates">
        {TEMPLATES.map((template) => {
          const isSelected = template.id === selected;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`template-card${isSelected ? " selected" : ""}`}
              onClick={() => setSelected(template.id)}
              onDoubleClick={() => onChoose(template.id)}
            >
              <span className="template-card-page">
                <img src={templateThumbnail(template.id, language)} alt={`First page of the sample CV in the ${template.name} template`} />
                {isSelected && (
                  <span className="template-card-check" aria-hidden="true">
                    <Check size={14} />
                  </span>
                )}
              </span>
              <span className="template-card-head">
                <strong>{template.name}</strong>
                {template.id === current && <span className="template-card-tag">Current</span>}
              </span>
              <small>{template.description}</small>
            </button>
          );
        })}
      </div>
      <div className="template-picker-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => (selected === current ? onClose() : onChoose(selected))}
        >
          {selected === current ? "Keep " : "Use "}
          {selectedTemplate.name}
        </button>
      </div>
    </div>
  );
}
