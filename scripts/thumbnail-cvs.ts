// The sample CV typeset with every template, one CV per language, for scripts/build-thumbnails.mjs.
import { createSampleWorkspace } from "../src/lib/document";
import { renderLatex } from "../src/lib/latex";
import { TEMPLATES } from "../src/lib/templates";
import type { CVLanguageCode } from "../src/lib/types";

export const THUMBNAIL_LANGUAGES: CVLanguageCode[] = ["en", "zh", "ja"];

/** `<template>-<language>` -> .tex */
export function thumbnailCvs(): Record<string, string> {
  const cvs: Record<string, string> = {};
  for (const template of TEMPLATES) {
    for (const code of THUMBNAIL_LANGUAGES) {
      const workspace = createSampleWorkspace();
      workspace.template = template.id;
      workspace.activeLanguage = code;
      workspace.languages.forEach((language) => (language.enabled = language.code === code));
      cvs[`${template.id}-${code}`] = renderLatex(workspace);
    }
  }
  return cvs;
}
