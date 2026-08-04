export const LEGACY_DIAGRAM_KEY = "mermade-diagram";
export const DIAGRAM_LIBRARY_KEY = "mermade-diagram-library-v1";
export const DIAGRAM_DOCUMENT_PREFIX = "mermade-diagram-document-v1:";

export type LocalDiagramSummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type LocalDiagramIndex = {
  version: 1;
  activeId: string;
  documents: LocalDiagramSummary[];
};

export type LocalDiagramDocument<T> = LocalDiagramSummary & {
  version: 1;
  diagram: T;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createLocalDiagramId(now = Date.now()) {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* use the timestamp fallback */ }
  return `diagram-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export function diagramDocumentKey(id: string) {
  return `${DIAGRAM_DOCUMENT_PREFIX}${id}`;
}

export function readLocalDiagramIndex(storage: StorageLike): LocalDiagramIndex | null {
  const value = readJson(storage, DIAGRAM_LIBRARY_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LocalDiagramIndex>;
  if (candidate.version !== 1 || typeof candidate.activeId !== "string" || !Array.isArray(candidate.documents)) return null;
  const documents = candidate.documents.flatMap((document) => {
    if (!document
      || typeof document.id !== "string"
      || typeof document.name !== "string"
      || !Number.isFinite(document.createdAt)
      || !Number.isFinite(document.updatedAt)) return [];
    return [{
      id: document.id,
      name: document.name,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }];
  });
  return { version: 1, activeId: candidate.activeId, documents };
}

export function readLocalDiagramDocument<T>(storage: StorageLike, id: string): LocalDiagramDocument<T> | null {
  const value = readJson(storage, diagramDocumentKey(id));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LocalDiagramDocument<T>>;
  if (
    candidate.version !== 1
    || candidate.id !== id
    || typeof candidate.name !== "string"
    || !Number.isFinite(candidate.createdAt)
    || !Number.isFinite(candidate.updatedAt)
    || !candidate.diagram
    || typeof candidate.diagram !== "object"
  ) return null;
  return candidate as LocalDiagramDocument<T>;
}

export function writeLocalDiagramIndex(storage: StorageLike, index: LocalDiagramIndex) {
  return writeJson(storage, DIAGRAM_LIBRARY_KEY, index);
}

export function writeLocalDiagramDocument<T>(storage: StorageLike, document: LocalDiagramDocument<T>) {
  return writeJson(storage, diagramDocumentKey(document.id), document);
}

export function removeLocalDiagramDocument(storage: StorageLike, id: string) {
  try {
    storage.removeItem(diagramDocumentKey(id));
    return true;
  } catch {
    return false;
  }
}

export function sortLocalDiagrams(documents: LocalDiagramSummary[]) {
  return [...documents].sort((first, second) => second.updatedAt - first.updatedAt || first.name.localeCompare(second.name));
}

export function updateLocalDiagramIndex(index: LocalDiagramIndex, document: LocalDiagramSummary, activeId = index.activeId): LocalDiagramIndex {
  const summary: LocalDiagramSummary = {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
  return {
    version: 1,
    activeId,
    documents: sortLocalDiagrams([summary, ...index.documents.filter((candidate) => candidate.id !== document.id)]),
  };
}

export function initialiseLocalDiagramLibrary<T>(storage: StorageLike, fallback: T, fallbackName: string, now = Date.now()) {
  const existing = readLocalDiagramIndex(storage);
  if (existing) {
    const available = existing.documents.filter((summary) => readLocalDiagramDocument<T>(storage, summary.id));
    const activeId = available.some((summary) => summary.id === existing.activeId)
      ? existing.activeId
      : available[0]?.id;
    if (activeId) {
      const index = { version: 1 as const, activeId, documents: sortLocalDiagrams(available) };
      const storageAvailable = writeLocalDiagramIndex(storage, index);
      return { index, document: readLocalDiagramDocument<T>(storage, activeId), storageAvailable, migrated: false };
    }
  }

  const legacy = readJson(storage, LEGACY_DIAGRAM_KEY);
  const diagram = legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy as T : fallback;
  const name = typeof (diagram as { name?: unknown }).name === "string" ? (diagram as { name: string }).name : fallbackName;
  const id = createLocalDiagramId(now);
  const document: LocalDiagramDocument<T> = { version: 1, id, name, createdAt: now, updatedAt: now, diagram };
  const summary: LocalDiagramSummary = { id, name, createdAt: now, updatedAt: now };
  const index: LocalDiagramIndex = { version: 1, activeId: id, documents: [summary] };
  const storageAvailable = writeLocalDiagramDocument(storage, document) && writeLocalDiagramIndex(storage, index);
  if (storageAvailable) {
    try { storage.removeItem(LEGACY_DIAGRAM_KEY); } catch { /* migration is already complete */ }
  }
  return { index, document, storageAvailable, migrated: Boolean(legacy) };
}
