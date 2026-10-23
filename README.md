# VÉRTICE

**An original cinematic science-fiction game for the browser, built with Three.js and TypeScript.** This milestone delivers the opening experience: a real-time space introduction, the title, and a working main menu with settings and credits. Gameplay is not part of this milestone; PLAY is intentionally disabled.

## What runs today

- **Opening sequence** (one deterministic timeline): black → a layered cosmos fades in (stars, sky, dust, a vast backlit planet, a moon) → an original procedural ship overtakes the camera and burns away towards the star → the VÉRTICE title → the side menu. Tap, click or press Escape/Enter/Space (or the _Skip intro_ button) to skip; the opening reaches the menu exactly once.
- **Main menu**: PLAY (disabled, marked _In development_), SETTINGS, CREDITS, with keyboard (Tab, arrows, Escape) and touch support. The 3D scene keeps living behind it.
- **Settings** that change real values and persist in `localStorage`: graphics quality (Automatic / Low / Medium / High: pixel-ratio cap, shadows and shadow-map size, star and dust counts, shader noise octaves, ship detail density), render scale (50–100 %), master volume (drives a synthesized ambient soundscape), reduced cinematic motion (System / On / Off) and fullscreen where the browser allows it.
- **Credits**: a film-style scrolling roll with exactly the supplied credits, which can be left immediately with Back or Escape (a static list with reduced motion).
- **Installable app (PWA)**: web manifest, icons and an offline-capable service worker. On Android, "Add to Home screen" / "Install app" opens VÉRTICE fullscreen, like a native game.
- **Deploys** to Vercel (`vercel.json`) and GitHub Pages (repository subpath), from the same build.

## What is procedural, simulated, or missing

- Everything visual is **procedural**: the ship is built from lofted hull sections, extrusions and instanced plating (no external model), the planet, sky and moon are shaders, and the panel textures are generated on a canvas. No third-party art or textures are used.
- The ambient sound is **synthesized at runtime** (Web Audio); browsers only start it after your first tap or key press.
- **Automatic** quality starts from conservative browser hints (never High) and only steps down after a measured sustained frame time above ~29 ms. It cannot know the real GPU.
- Antialiasing is fixed when the WebGL context is created; a change of quality tier applies it on the next launch (the settings panel says so).
- There is no gameplay, mission, save or audio-file system yet. The original walkable blockout scene (`BootScene`) stays registered for the future PLAY transition.

## Commands

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `npm ci`               | Install exact, lockfile-pinned dependencies               |
| `npm run dev`          | Start the Vite development server                         |
| `npm run typecheck`    | Strict TypeScript check without emitting files            |
| `npm run lint`         | Run ESLint                                                |
| `npm test`             | Run the Vitest suite once                                 |
| `npm run build`        | Typecheck and make the static production build in `dist/` |
| `npm run preview`      | Preview the production build locally                      |
| `npm run format:check` | Check formatting                                          |

Requires Node.js 20.19+ and a browser with **WebGL 2**.

## Deploying

- **Vercel**: import the repository in Vercel (or push to a connected repository). `vercel.json` sets the Vite preset, `npm ci`, `npm run build`, `dist/`, long-lived caching for fingerprinted files in `/static/` and no-cache for the service worker and manifest. No environment variables are needed.
- **GitHub Pages**: push to `main`; the workflow builds with `GITHUB_PAGES=true` (base `/vertice-open-world/`). Set **Settings → Pages → Source** to **GitHub Actions**.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the Android test procedure and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the structure.

## Rights and scope

VÉRTICE is an original project. It does not include or reproduce any other game's characters, maps, logo, interface, music or art. Fonts are self-hosted from the SIL Open Font License packages `@fontsource/cormorant-garamond`, `@fontsource-variable/manrope` and `@fontsource/dm-mono`. No license is declared for the project's own code yet.
