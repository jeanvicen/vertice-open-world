# VÉRTICE

**An original cinematic science-fiction game for the browser, built with Three.js and TypeScript.** This milestone delivers the opening experience: a real-time space introduction, the title, and a working main menu with settings and credits. Gameplay is not part of this milestone; PLAY is intentionally disabled.

## What runs today

- **Start screen** ("Toque/Clique para começar"): browsers only allow sound after a gesture, so the film starts from one tap or key. On a phone browser the same tap also enters fullscreen.
- **The opening film** (one deterministic timeline, about 34 s): black → **"Klipza Studio apresenta"** → the **VÉRTICE** title card → a space battle already under way (raiders destroying a defence patrol, with the planet as backdrop) → the protagonist's ship drops out of warp in the middle of the fight and destroys every raider while the camera chases it → it turns and burns towards the planet until it disappears → the menu. There is no skip button; on a keyboard, Escape skips.
- **Main menu**: PLAY (disabled, marked _In development_), SETTINGS, CREDITS, with keyboard (Tab, arrows, Escape), touch and interface sounds. The 3D scene keeps living behind it.
- **Structured, synthesized sound** (Web Audio, no audio files): separate music, effects, ambience and interface buses, a shared synthetic reverb and a master compressor. The score (studio sting, title hit, a battle cue that lifts into a heroic major when the protagonist arrives, a resolving pad, the ambient bed) and every laser, impact, explosion, warp and engine sound are scheduled from the same timeline as the visuals, panned by on-screen position and dulled by distance.
- **Visuals**: an Earth-like world (oceans with sun glint, continents, polar ice, drifting clouds, reddened terminator light, city lights on the night side), a ringed gas giant (ring shadow, backlit ring glow), a small red planet, a moon, the star with soft diffraction rays, a shader sky and star field; raider and defender fighters, energy bolts, explosions (flash, turbulent fireball and smoke, shockwave, sparks, tumbling debris, a light that hits nearby hulls) and HDR bloom on Medium/High.
- **Settings** that change real values and persist: graphics quality (Automatic / Low / Medium / High: pixel ratio, shadows, bloom and MSAA, star/dust counts, shader octaves, detail), render scale, master volume, reduced cinematic motion (a short, still version of the opening), fullscreen, and **Install app** where the browser offers installation (with iPhone instructions).
- **Credits**: a film-style roll with exactly the supplied credits; Back or Escape leaves at once.
- **Installable app (PWA)**: manifest, icons and an offline service worker; installed, it opens fullscreen like a native game.
- **Deploys** to Vercel (`vercel.json`) and GitHub Pages from the same build.

## What is procedural or missing

- Everything visual and audible is generated in code: no third-party models, textures or audio files.
- Automatic quality starts conservatively and steps down only after measured slow frames; it cannot know the real GPU.
- Antialiasing of the canvas is fixed when the WebGL context is created.
- There is no gameplay yet; the walkable blockout (`BootScene`) stays registered for the future PLAY transition.

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
