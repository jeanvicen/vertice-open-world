# VÉRTICE — Open-World Foundation

**A real, runnable Three.js and TypeScript foundation for an original browser-based cinematic open-world game.** The first milestone is intentionally small: one WebGL renderer, a single managed update loop, resilient browser controls, graphics settings and an original procedural landscape blockout. It is not a finished game or a production-art showcase.

## What runs today

- Three.js / WebGL renderer with SRGB output, ACES tone mapping, controlled pixel ratio, configurable shadows and resize handling.
- One lifecycle-managed, frame-rate-independent simulation loop, with long frame delays capped at 50 ms.
- An independently replaceable first scene built from simple procedural geometry.
- Mouse/touch look, WASD/arrow-key movement and a touch-friendly directional pad.
- Validated Low/Balanced/High graphics settings and adjustable render scale, stored locally without a backend.
- Explicit GPU-resource and event-listener cleanup, screen visibility handling, accessible WebGL startup errors and context-loss recovery.
- A relative-path asset manifest/loader for future GLB models, textures and audio; no unlicensed or fake production art.
- Strict TypeScript, ESLint, Prettier, Vitest, GitHub Actions and GitHub Pages deployment setup.

## Architecture

`src/app` wires up startup and error recovery; `src/core` coordinates lifecycle and timing; `src/rendering` owns WebGL and performance configuration; `src/scenes` contains scene transitions and the original entry blockout; `src/world` owns environment roots; `src/systems` isolates input and persistent graphics settings; `src/assets` establishes a validated, observable asset-loading boundary; `src/ui` wires real graphics controls. No empty stubs claim to implement missions, physics, vehicles, multiplayer, save data or authored open-world streaming. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements and browser-based development

- Node.js **20.19+** and npm; the release workflows use Node.js 22.
- A modern browser with WebGL enabled. Performance depends on the browser, device, GPU and thermals.
- A desktop PC is not required: the repository can be opened in a browser-based Codespace or compatible cloud IDE. The published game uses the viewer's own browser GPU, not a cloud GPU.

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
| `npm run format`       | Format project files                                      |

A normal check cycle is `npm ci`, followed by `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Development and deployment procedures are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## GitHub Pages

Push to `main` to trigger validation and static Pages deployment. In **Settings → Pages**, choose **GitHub Actions** as the publishing source. The deployment workflow uses the repository-specific Vite subpath `/vertice-open-world/`, uploads `dist/`, and publishes with the official Pages Actions. GitHub Pages must first be enabled in the repository settings; until the first successful workflow finishes, no live game URL is claimed.

## Known limitations

The buildings and terrain are intentionally low-detail procedural placeholders—not authored production assets. There is no cinematic introduction or title menu yet; the next milestone builds those scenes on the existing lifecycle. There is no physics, streaming, mission or save system, cloud service, multiplayer, authored characters/vehicles, post-processing/bloom or WebGPU dependency. Font entries are explicitly rejected until a parser is added. Scene transitions share the lifecycle baseline but no narrative sequence is shipped. WebGL may be blocked by device/browser policy, and Android performance is not identical across devices. Vitest checks pure logic; a real-browser visual and GPU/device integration pass remains separate.

## Rights and scope

VÉRTICE is an original project. It does not include or reproduce any other game's characters, maps, logo, distinctive interface, music, dialogue, or art. No license is declared for this project at this foundation stage; review and deliberately choose a project license before external code contributions. Third-party library licenses remain those of their individual maintainers.
