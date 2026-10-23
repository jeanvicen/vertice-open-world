# Development

## Install and run

```sh
npm ci
npm run dev
```

Open the Vite URL. To test from a phone on the same network, open `http://<computer-ip>:5173`. In a Codespace, forward port 5173. Production preview: `npm run build && npm run preview`.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Vitest covers the intro timeline (order, exactly-once, frame-rate independence, skip), the ship's flight profile, the menu state machine, quality heuristics and adaptive step-down, settings validation, persistence and migration, and the HTML interface in happy-dom (PLAY disabled, settings patches, exact credits, immediate exit). It does not replace a real-device GPU pass.

## Deploying

**Vercel**: import the GitHub repository in Vercel. `vercel.json` already declares the Vite framework, `npm ci`, `npm run build` and the `dist` output, so the defaults need no changes. Every push to a connected branch creates a preview deployment.

**GitHub Pages**: push to `main`, with **Settings → Pages → Source** set to **GitHub Actions**. To simulate the subpath locally: `GITHUB_PAGES=true npm run build && npm run preview`, then open `/vertice-open-world/`. All runtime paths (assets, manifest, service worker) are relative to Vite's base.

The service worker is only registered in production builds. After a deploy, the page (HTML) is network-first and picks up the new version on the next visit; fingerprinted files under `/static/` are cached forever. If you change `public/sw.js`, bump its `CACHE` name.

## Android test procedure

1. Open the published URL in Chrome for Android, sound on. Tap **Toque para começar**: the page goes fullscreen, then "Klipza Studio apresenta", the title card, the battle, the protagonist's arrival and departure, and the menu, with music and effects.
2. Tapping during the film must not skip it (there is no skip button by design).
3. Check that PLAY is dimmed and labelled _In development_ and does nothing when tapped.
4. Open **Settings**: switch Low/Medium/High (the note under the control changes, and the image gets sharper or softer), move Render scale to 50 % (visibly softer), move the volume (the ambient sound changes after your first tap). Reload: your choices persist.
5. Open **Credits**: the roll starts low on the screen; **Back** works immediately.
6. Rotate the phone during the opening and in the menu: the layout switches between portrait (centred title, menu at the bottom) and landscape (side menu) without restarting.
7. Chrome menu → **Add to Home screen / Install app**, then open from the home screen: it runs fullscreen. Turn on airplane mode and open it again: it should still start (offline cache).
8. With **Settings → Reduced cinematic motion → On**, reload: short dissolves, a still camera, a static credits list.

If the opening stutters on a given phone, Automatic steps down by itself after a few seconds of slow frames. Low plus a 60–70 % render scale is the safe manual setting.

## Assets

Place only original or properly licensed files in `public/assets/…`, document their source and license, and register them in `ASSET_MANIFEST`. To replace the procedural ship, implement `ShipModel` (`src/scenes/space/ship/ShipModel.ts`) around a loaded GLB.
