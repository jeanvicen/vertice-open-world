# Architecture

## Milestone boundary

This milestone is the opening experience: the cinematic introduction, the title, the main menu, settings and credits. Gameplay is future work; PLAY is disabled until a playable scene exists.

## Ownership and flow

`app/bootstrap.ts` loads the fonts and styles, starts `App` and (in production) registers the service worker. `App` is the composition root: it loads settings and creates the `QualityManager`, `MotionPreferenceWatcher`, `Renderer`, `AudioEngine`, `InputSystem`, `ExperienceUI` and `Game`. It holds no scene logic.

`Game` owns the **only** frame loop (`GameLoop`, deltas capped at 50 ms) and drives `SceneManager`, which calls the active scene's `enter`, `update`, `render`, `resize` and `exit`. Scenes never start their own loops or WebGL contexts.

```
App ── Game ── GameLoop (single requestAnimationFrame loop)
 │       └── SceneManager ── 'space' SpaceIntroScene (opening + living menu backdrop)
 │                        └── 'world' BootScene (kept for the future PLAY transition)
 ├── Renderer (WebGL context, tone mapping, pixel ratio, resize, context loss)
 ├── QualityManager (preference → RenderProfile, adaptive step-down in Automatic)
 ├── MotionPreferenceWatcher (player choice + prefers-reduced-motion)
 ├── AudioEngine (master gain, synthesized ambience after a user gesture)
 └── ExperienceUI (HTML: title, menu, SettingsMenu, CreditsScreen)
```

## The opening (`src/scenes/space`)

- `IntroTimeline` is a pure clock with explicit phases `void → cosmos → ship → title → menu`. It announces each phase exactly once and in order, whatever the frame rate, frame gaps or repeated skip requests. Reduced motion uses a short schedule without the ship passage or camera travel.
- Every visual is **sampled from timeline time**, not integrated per frame: the ship's distance (`ShipFlight`: steady cruise, then constant-thrust burn along an arc-length-parameterised Catmull–Rom path), the camera pose (`CinematicCamera`: slow approach, a slight lean towards the overtaking ship, then a near-still drift) and the staggered reveal of each cosmic layer. The opening therefore looks the same at 20 or 120 fps.
- `Cosmos` holds the sky (nebula computed per vertex on a dense sphere, plus fine per-pixel grain), stars (sorted brightest first so lower tiers keep the strongest via draw range), wrap-around dust, the planet (banded shader with soft terminator and limb haze; the night side skips the noise), the atmosphere shell (ray closest-approach glow) and the moon. Custom shaders include Three's tone-mapping, colour-space and dithering chunks so they obey exposure and avoid banding.
- `ProceduralShip` implements the `ShipModel` interface. A licensed GLB can replace it by implementing the same interface; the timeline and flight path need no changes.
- A skip cuts through a short exposure dip to the final composition.

## Interface (`src/ui`)

`ExperienceUI` reacts only to timeline phases and input. `MenuStateMachine` (pure) defines the allowed views (`intro`, `main`, `settings`, `credits`) and refuses to open a view while a transition runs, so rapid input cannot interleave transitions. Returning to the main menu is never delayed. `SettingsMenu` binds native radios and sliders and reports real status (active tier, audio state, system motion preference). `CreditsScreen` renders `credits.ts` and rolls it with the Web Animations API (compositor-driven, no second JavaScript loop).

PLAY is a disabled button whose enablement depends only on an `onPlay` handler passed to `ExperienceUI`. Adding gameplay means providing that handler (for example, a transition to the registered `world` scene) and a `world` view; the menu needs no rewrite.

## Quality and settings

`RenderProfile` (Low/Medium/High) sets the pixel-ratio cap, antialiasing (at context creation), shadows and shadow-map size, star and dust counts, noise octaves and ship detail density. `UserSettings` (v2) adds render scale, volume and motion preference. Stored data is validated field by field; the foundation's v1 entry migrates (`balanced` → `medium`).

## Cleanup

Each owner disposes what it creates: scenes track geometries, materials and textures in a `ResourceTracker`; the ship owns its own; listeners are removed in every `dispose`. Retry after a failed start disposes and rebuilds everything without duplicating the renderer or loop.
