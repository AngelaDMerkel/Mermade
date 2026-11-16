# Editor architecture and refactoring review

The editor keeps Mermaid source as the authoritative document. The visual graph
is a projection used for layout and selection; it must never silently replace
source that the projection cannot represent.

## Findings addressed

| Finding | Consequence | Change |
| --- | --- | --- |
| Document types, conversion, engine loading, validation and history lived inside a 4,014-line React component. | Small feature changes required understanding unrelated UI and lifecycle logic. | Extracted the document domain, renderer runtime, source transaction and history into `app/editor/`. |
| Async source validation captured one diagram but committed into whichever diagram was open when parsing finished. | A slow import, source edit, deletion or version change could overwrite newer work or another document. | Document revision and request tickets reject obsolete work; imports also check their ticket after reading the file. |
| History snapshots came from React render closures, separately from functional state updates. | Consecutive updates could record the same old snapshot and skip an undo step. | One synchronous document session owns the current document and bounded undo/redo history. |
| Preview, export and validation separately initialised Mermaid's mutable singleton. | Concurrent operations could change configuration during a render. | A runtime queue covers engine loading, initialisation and the entire parse/render operation; failures release the queue. |
| Storage methods were guarded, but evaluating `localStorage` was not always guarded. | Browsers blocking the getter could break create, switch and autosave even after startup fell back to memory. | All editor storage access goes through an adapter that preserves the session cache and reports unavailable persistence. |
| Some regression checks asserted source snippets inside the monolithic component. | Moving correct code could fail tests without a behaviour change. | Extracted conversion/history/transaction behaviour is tested directly; remaining static UI checks continue in the existing suite. |

## Module responsibilities

- `diagram-types.ts`: the persisted document and visual graph contracts.
- `diagram-model.ts`: starter/blank documents, source projection, serialisation and existing restoration/normalisation rules. No React or browser APIs.
- `mermaid-version.ts`: bundled engine selection and syntax version hints.
- `document-session.ts`: immutable document transitions, bounded history and async edit tickets. No React or renderer dependency.
- `use-document-session.ts`: React subscription and unmount invalidation.
- `source-edit.ts`: candidate preparation, injected validation and conditional commit. The UI receives success, rejection or cancellation.
- `mermaid-runtime.ts`: lazy engine/layout imports, strict configuration, serialised validation/rendering and temporary DOM cleanup.
- `browser-storage.ts`: safe acquisition of browser storage. The existing `local-diagram-library.ts` owns the on-disk keys and library format.
- `mermaid-editor.tsx`: UI, canvas gestures, selection, local library orchestration and renderer presentation.

## Adding or changing editing features

Use `session.commit(update)` for a discrete edit. Use `checkpoint()` followed by
immutable `set(update)` calls for a drag or a field edit grouped into one undo
step. Use `reset(document)` when opening another document; history never crosses
that boundary. Updates must return new objects rather than mutate snapshots.

For Mermaid candidates, use `commitValidatedSource` and the runtime validator.
Treat cancellation separately from invalid syntax: an obsolete result must not
open repair UI or replace the current source draft. Other asynchronous document
operations must capture a ticket before their first await and check it before
changing state. Typing a newer source draft invalidates pending source edits.

Keep direct Mermaid imports and configuration inside the runtime. Keep
source conversion and document transitions testable without React or Chrome.

## Verification

`npm run test:unit` runs tests that do not require a production build or Chrome,
including deferred validation races, history boundaries, exact source retention,
renderer queue recovery and blocked storage access. `npm test` builds the app and
runs the complete suite, including real Mermaid parsing, SVG geometry and browser
interactions. `npm run lint` checks source and hook dependencies.

## Remaining limitations and next work

This refactor establishes boundaries around the core; it does not complete the
decomposition of the UI. The remaining editor component still owns many dialog,
inspector and gesture states. Extract feature components/hooks along those
boundaries as those features change.

The local library still uses separate document/index writes and has no cross-tab
conflict resolution. Two tabs can overwrite each other's latest data or library
index. Storage restoration also validates the envelope more thoroughly than the
nested document model. A future persistence change should add schema validation,
recovery of malformed records, and transactional/conflict-aware storage together
so invalid records are preserved for recovery rather than overwritten by defaults.

The FreeForm projection is a tolerant, partial Mermaid parser. Complex valid
syntax can render without appearing completely in the projected graph. Keep
patching authoritative source and test unsupported syntax when extending visual
editing. The renderer queue prevents configuration overlap but does not move SVG
rendering off the main thread or cancel already-running Mermaid work.

## Flowchart-only scope

The editor accepts only `flowchart`, `graph`, and `flowchart-elk` declarations.
`mermaid-types.ts` recognises these after frontmatter and comments; source
transactions and both presentation adapters enforce the same policy before
calling a renderer. Mermaid remains the syntax authority after that check.
There is no diagram-family registry, type picker, Structured/Data workspace,
Gantt model, ZenUML plugin, or Block renderer patch.

Restoration preserves older non-flowchart source verbatim. The library keeps
those documents available, while the UI disables visual tools and offers source
viewing, copying and export. Source replacement still goes through the validated
transaction. Tests cover rejected imports, unchanged history, and recovery from
browser storage.

The build retains a narrowly scoped ELK compatibility patch: ELK graph logging
and cloning must omit DOM-backed fields to avoid React's circular metadata.
The former Block and Gantt patches are removed. The real browser suite tests ELK
inside React, since standalone Mermaid rendering does not expose this failure.
