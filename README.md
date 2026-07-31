# Mermade

Mermade is a direct-manipulation visual editor for Mermaid flowcharts. It keeps the diagram model in the browser and continuously generates portable Mermaid source.

## Current editor

- Drag nodes around a dotted canvas
- Double-click a node to rename it in place
- Edit node text, ID, shape, fill, and text color in the inspector
- Create and edit labeled relationships
- Shift-click to multi-select and move nodes together
- Convert selected nodes into a Mermaid `subgraph`
- Edit generated Mermaid source and apply supported flowchart source back to the canvas
- Copy Mermaid, download `.mmd`, or render and download SVG
- Undo and redo editor operations
- Save the working diagram locally in the browser
- Switch between left-to-right and top-to-bottom Mermaid directions

The source importer intentionally targets Mermade's flowchart subset for the first version. Unsupported Mermaid directives remain a planned parser milestone.

## Local development

Requires Node.js 22 or newer.

```bash
npm install --ignore-scripts
npm run dev
```

Open `http://localhost:3000`.

## GitHub Pages

The editor has no server-side data dependency. The included workflow builds a static export and deploys it whenever `main` is pushed. In the repository settings, choose **GitHub Actions** as the Pages source.

You can verify the static target locally with:

```bash
npm run build:pages
```

## Deployment shape

The project supports two delivery paths from one editor core:

- **GitHub Pages:** static, browser-local, ideal for the initial source-available release.
- **Sites / Cloudflare:** the current Vinext production build, ready for later persistence and collaboration services.

A later Docker image can serve the static editor with nginx first, then add an API only when shared documents, authentication, or real-time collaboration are introduced.

## Acknowledgements and provenance

- Diagram parsing and SVG rendering are powered by [Mermaid](https://github.com/mermaid-js/mermaid), used as an npm dependency under its own license.
- Interface icons are provided by [Lucide](https://github.com/lucide-icons/lucide), also used as an npm dependency under its own license.
- The browser application is built with React and Next.js, with Vinext providing the current Cloudflare-compatible build path.
- The repository began with generated OpenAI Sites/Vinext project scaffolding. That boilerplate supplies build and optional hosting integration; it is separate from Mermade's editor implementation and is not required to host the editor through GitHub Pages.

Mermade's editor UI, freeform canvas, interaction model, and Mermaid source adapter were implemented specifically for this project. No application code was copied or adapted from [saketkattu/mermaid-visual-editor](https://github.com/saketkattu/mermaid-visual-editor) or from Mermaid's own editor examples.

## Brand assets

The approved Connected M identity is available in `public/brand` as editable SVG masters and PNG exports. Its primary accent is Mermaid pink (`#E0095F`). The title card is supplied at 1200 × 630 pixels, and the favicon package includes SVG, PNG, Apple touch icon, and ICO formats.

## License

Copyright © 2026 Colin Alexander Duffy.

Except where otherwise noted, Mermade's original source code, documentation, and visual assets are licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/). Redistribution and adaptation require attribution, are limited to noncommercial use, and must remain under the same license. See [`LICENSE`](LICENSE) for the complete legal terms.

Third-party packages and other externally sourced material are excluded from this grant and remain subject to their respective licenses. Patent and trademark rights are not granted.

## Near-term roadmap

1. Complete Mermaid flowchart parser coverage and round-trip preservation.
2. Add marquee selection, resize handles, alignment guides, and auto-layout.
3. Support editable edge routing and node ports.
4. Add reusable themes and custom Mermaid `classDef` editing.
5. Expand to sequence, state, class, and ER diagrams using diagram-specific canvases.
6. Add optional shared projects and multiplayer collaboration behind the Docker deployment.
