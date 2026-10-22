# Development

## Requirements

Install Node.js 22 LTS (or another supported Node release at least `20.19`) with npm. Use a current desktop browser for local inspection, or open this GitHub repository in a browser-based Codespace/cloud IDE. The game renders on the device's own browser GPU; GPU rendering in the development environment is not required.

## Install and run

```sh
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal. In a Codespace, open or forward the Vite server port (5173). To preview the production output use `npm run build` followed by `npm run preview`.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

`npm run build` includes a TypeScript no-emit check. Vitest covers deterministic frame timing and graphics-preference bounds; it does not replace a browser/GPU integration test. The build produces static files in `dist/`.

## GitHub Pages

GitHub Actions deploys `main` on push. In the repository's **Settings → Pages**, set the source to **GitHub Actions**. The Pages workflow installs the lockfile, typechecks, lints, runs Vitest, and builds with `GITHUB_PAGES=true`, which sets Vite's base to `/vertice-open-world/`. Then its deploy job publishes the artifact. A manually triggered Pages workflow is available under **Actions → Build and deploy to GitHub Pages → Run workflow**.

For a local repository-subpath simulation, use `GITHUB_PAGES=true npm run build`; run the preview with `npm run preview`. Keep static assets relative to Vite's configured base; the included asset loader resolves files from `import.meta.env.BASE_URL`, not from `/assets/...`.

## Creating a real asset

Place original or properly licensed files in `public/assets/models`, `textures`, `audio` or `fonts`, document their provenance/license, then add an ID and safe relative path to `ASSET_MANIFEST`. `AssetLoader` currently loads GLB/glTF models, textures and audio buffers. Font loading is intentionally rejected until a font parser is implemented. Assign each loaded GPU asset a clear scene owner and dispose it when that owner exits.

## Input and device checks

Look with a primary-pointer drag; move with WASD/arrow keys; on touch screens drag the view and use the on-screen directional pad. Test device orientation changes and background/foreground transitions on target browsers. Use the quality selector and render-scale slider to reduce GPU load. CSS observes browser safe-area insets and `prefers-reduced-motion`.

## CI

The `Validate` workflow runs on pull requests and pushes to `main`. The separate Pages workflow repeats all quality gates before publishing. The checked-in npm lockfile, Node LTS version, static `dist` artifact and Pages subpath base are the reproducibility and release contract.
