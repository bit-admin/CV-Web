import { migrateCvData, migrateDocumentToWorkspace, normalizeDocument, normalizeWorkspace } from "./document";
import type { CVWorkspace } from "./types";

const STORAGE_KEY_V1 = "cv-forge-data-v1";
const STORAGE_KEY_V2 = "cv-forge-document-v2";
const STORAGE_KEY_V3 = "cv-forge-workspace-v3";

function readJson(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Reads the single CV stored before the CV library existed (any generation). */
export function loadStoredWorkspace(): CVWorkspace | null {
  const storedWorkspace = normalizeWorkspace(readJson(STORAGE_KEY_V3));
  if (storedWorkspace) {
    return storedWorkspace;
  }

  const storedDocument = normalizeDocument(readJson(STORAGE_KEY_V2));
  if (storedDocument) {
    return migrateDocumentToWorkspace(storedDocument);
  }

  const legacyData = readJson(STORAGE_KEY_V1);
  return legacyData ? migrateDocumentToWorkspace(migrateCvData(legacyData)) : null;
}

export function clearStoredDocument(): void {
  localStorage.removeItem(STORAGE_KEY_V3);
  localStorage.removeItem(STORAGE_KEY_V2);
  localStorage.removeItem(STORAGE_KEY_V1);
}
