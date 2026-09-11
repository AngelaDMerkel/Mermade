"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DocumentSession } from "./document-session";

export function useDocumentSession<T>(initial: T) {
  const [session] = useState(() => new DocumentSession(initial));
  const document = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => () => session.invalidatePendingEdits(), [session]);
  return { session, document };
}
