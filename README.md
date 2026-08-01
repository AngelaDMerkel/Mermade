# Mermade

Mermade is a browser-local visual editor for the diagram types supported by Mermaid 11.16. Mermaid source remains the canonical, portable document format.

## Current editor

- Drag nodes around a dotted canvas
- Double-click a node to rename it in place
- Edit node text, ID, shape, fill, and text color in the inspector
- Create and edit labeled relationships
- Shift-click to multi-select and move nodes together
- Convert selected nodes into a Mermaid `subgraph`
- Edit Mermaid source for every registered diagram type
- Switch safely between diagram types using validated starter templates
- Automatically organize pasted flowcharts from their relationships, with a manual Organize control for restoring the layout
- Choose shapes by their recommended flowchart purpose, with common patterns first and Mermaid's complete shape catalog available
- Open diagram-aware Help from the canvas rail for quick-start syntax, editing guidance, common pitfalls, official Mermaid documentation, and curated standards or method references
- Use FreeForm visual editing for graph and spatial diagrams
- Use Structured visual editing for ordered, lane, and timeline diagrams
- Use Data visual editing for chart and dataset-oriented diagrams
- Copy Mermaid, download `.mmd`, or render and download SVG
- Import local `.mmd`, `.mermaid`, `.md`, or `.txt` files, including Mermaid code fences in Markdown
- Undo and redo editor operations
- Save the working diagram locally in the browser
- Switch between left-to-right and top-to-bottom Mermaid directions
- Apply every current Mermaid theme, rendering look, compatible graph layout, font, and Base-theme palette from the Style inspector; canvas rendering and SVG export use the same portable Mermaid frontmatter
- Review parser-verified repair options for common syntax damage, Mermaid version mismatches, and diagram-specific structural errors
- Learn the interface through a first-launch welcome dialog and optional guided tour, which can be restarted from Help
- Use `F` to fit the chart and `O` to organise a flowchart, alongside the canvas tool shortcuts

The rich direct-manipulation canvas currently provides its deepest node, relationship, and subgraph controls for flowcharts. Other diagram types use family-specific statement cards; a visual edit is committed only after the selected Mermaid engine parses the candidate source successfully.

## Local development

Requires Node.js 22 or newer.

```bash
npm install --ignore-scripts
npm run dev
```

Open `http://localhost:3000`.

## Testing

```bash
npm test
```

The test command builds the local application and runs registry-driven standards suites against every supported Mermaid type:

- **Syntax:** the starter source must pass Mermaid's real browser parser.
- **Rendering:** the starter must produce a non-empty, error-free SVG with finite geometry, visible text and shapes, and non-distorting scaling. Type-specific regressions, such as C4 title placement, are checked in the same pass.
- **Diagram style:** each starter must continue to parse and render after Mermade adds its portable frontmatter style configuration.
- **Theme and layout engines:** every exposed Mermaid 11 theme, rendering look, and graph layout must produce valid, materially styled SVG; portable styling is also checked with Mermaid 10.

Browser interaction tests additionally cover first-launch onboarding, the guided tour, verified source repair, direct Mermaid node editing, exact FreeForm shapes, and position-preserving view switches.

Rendering tests use Playwright Core with an installed Google Chrome. Set `CHROME_PATH` when Chrome is installed in a nonstandard location. Adding a type to the shared registry automatically adds it to both suites, so a new type cannot silently skip the standards.

## GitHub Pages

The editor has no server-side data dependency. The included workflow builds a static export and deploys it whenever `main` is pushed. Before the first deployment, open **Settings → Pages** in the repository and choose **GitHub Actions** as the Pages source. GitHub does not allow the workflow's default token to enable Pages for a repository that has never enabled it.

You can verify the static target locally with:

```bash
npm run build:pages
```

## Deployment shape

The current application is a static, browser-local GitHub Pages build with no authentication, database, worker, or server-side data dependency. A later Docker image can serve the same static editor with nginx first, then add an API only when shared documents, authentication, or real-time collaboration are introduced.

## Acknowledgements and provenance

- Diagram parsing and SVG rendering are powered by [Mermaid](https://github.com/mermaid-js/mermaid), used as an npm dependency under its own license.
- ELK and Tidy Tree layouts use Mermaid's official [`@mermaid-js/layout-elk`](https://www.npmjs.com/package/@mermaid-js/layout-elk) and [`@mermaid-js/layout-tidy-tree`](https://www.npmjs.com/package/@mermaid-js/layout-tidy-tree) packages.
- ZenUML support is provided by Mermaid's official [`@mermaid-js/mermaid-zenuml`](https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid-zenuml) plugin.
- Interface icons are provided by [Lucide](https://github.com/lucide-icons/lucide), also used as an npm dependency under its own license.
- The browser application is built with React and Next.js and exported statically for GitHub Pages.

Mermade's editor UI, freeform canvas, interaction model, and Mermaid source adapter were implemented specifically for this project. No application code was copied or adapted from [saketkattu/mermaid-visual-editor](https://github.com/saketkattu/mermaid-visual-editor) or from Mermaid's own editor examples.

The local build applies a narrow compatibility patch to Mermaid's generated Block Diagram renderer: its debug serialization must omit a temporary D3 DOM handle when Mermaid runs inside a React-owned document. The patch changes no parser or diagram semantics and is applied automatically by the development and build scripts.

## Brand assets

The approved Connected M identity is available in `public/brand` as editable SVG masters and PNG exports. Its primary accent is Mermaid pink (`#E0095F`). The title card is supplied at 1200 × 630 pixels, and the favicon package includes SVG, PNG, Apple touch icon, and ICO formats.

## License

Copyright © 2026 Colin Alexander Duffy.

Except where otherwise noted, Mermade's original source code, documentation, and visual assets are licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/). Redistribution and adaptation require attribution, are limited to noncommercial use, and must remain under the same license. See [`LICENSE`](LICENSE) for the complete legal terms.

Third-party packages and other externally sourced material are excluded from this grant and remain subject to their respective licenses. Patent and trademark rights are not granted.

## Near-term roadmap

1. Add deeper diagram-specific forms for Sequence, Gantt, State, Class, and ER syntax.
2. Add alignment guides and auto-layout to the flowchart FreeForm canvas.
3. Support editable edge routing and node ports.
4. Add reusable named style presets and custom Mermaid `classDef` editing.
5. Add optional shared projects and multiplayer collaboration behind the Docker deployment.
