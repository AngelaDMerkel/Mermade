export type DocumentUpdate<T> = T | ((current: T) => T);

export type EditTicket = { readonly revision: number; readonly request: number };

/**
 * Owns one open document and its undo history. Updates must be immutable.
 * All transitions are synchronous, so consecutive edits cannot capture stale
 * React render state. Resetting a document also invalidates pending edits.
 */
export class DocumentSession<T> {
  private present: T;
  private past: T[] = [];
  private future: T[] = [];
  private revision = 0;
  private request = 0;
  private listeners = new Set<() => void>();

  constructor(initial: T, private readonly historyLimit = 60) {
    this.present = initial;
  }

  getSnapshot = () => this.present;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: T) {
    this.present = next;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private resolve(update: DocumentUpdate<T>) {
    return typeof update === "function" ? (update as (current: T) => T)(this.present) : update;
  }

  /** Group continuous changes (a drag or text field) into one undo step. */
  checkpoint = () => {
    this.past.push(this.present);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
  };

  set = (update: DocumentUpdate<T>) => {
    const next = this.resolve(update);
    if (Object.is(next, this.present)) return;
    this.future = [];
    this.publish(next);
  };

  commit = (update: DocumentUpdate<T>) => {
    const next = this.resolve(update);
    if (Object.is(next, this.present)) return;
    this.checkpoint();
    this.publish(next);
  };

  undo = () => {
    if (!this.past.length) return;
    this.future.push(this.present);
    this.publish(this.past.pop()!);
  };

  redo = () => {
    if (!this.future.length) return;
    this.past.push(this.present);
    this.publish(this.future.pop()!);
  };

  reset = (next: T) => {
    this.past = [];
    this.future = [];
    this.publish(next);
  };

  invalidatePendingEdits = () => { this.request += 1; };

  beginEdit = (): EditTicket => {
    this.invalidatePendingEdits();
    return { revision: this.revision, request: this.request };
  };

  isCurrent = (ticket: EditTicket) => ticket.revision === this.revision && ticket.request === this.request;

  commitEdit = (ticket: EditTicket, update: DocumentUpdate<T>) => {
    if (!this.isCurrent(ticket)) return false;
    this.commit(update);
    // Consume tickets even for edits that leave the document unchanged.
    this.invalidatePendingEdits();
    return true;
  };
}
