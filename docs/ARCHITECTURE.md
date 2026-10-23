# Architecture

## Milestone boundary

This milestone is the opening experience: the cinematic film (battle included), structured sound, the title, the main menu, settings and credits. Gameplay is future work; PLAY is disabled until a playable scene exists.

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

- `IntroTimeline` is a pure clock with explicit phases `void → studio → title → battle → hero → departure → menu`, announced exactly once and in order whatever the frame rate, frame gaps or skips. It starts only when the start screen is activated. Reduced motion uses a short schedule: the two cards, then a still dissolve to the menu.
- `battle/Choreography` is the whole fight as data, built once: fighters on looping dogfight orbits, every bolt with its fire and impact time (killing shots are solved so they land exactly on their target), explosions and sound cues. Frames only sample it, and it is unit-tested.
- `ShipFlight` is the protagonist: a warp drop onto the battlefield, a run through the fight and a constant-thrust departure towards the planet. `CinematicCamera` turns time into shots: an establishing push, a cut on the warp, a lagged chase that keeps the horizon level, and a long ease back to the menu framing; explosions add a small, distance-attenuated shake.
- `battle/Battle` renders fighters (instanced), engine glows and sparks (one point batch), bolts (instanced ribbons), fireballs/smoke and flashes/shockwaves (instanced procedural billboards), debris (instanced) and one explosion light. `Cosmos` holds the sky, stars, dust, the Earth-like planet with atmosphere, the ringed giant, the red planet, the moon and the star. `PostProcessing` adds HDR bloom (half-float target, threshold above normal surfaces, OutputPass for tone mapping) on Medium/High.
- `ProceduralShip` implements `ShipModel`; a licensed GLB can replace it without touching the timeline.

## Audio (`src/audio`)

`AudioEngine` builds the graph after the start gesture: music, effects, ambience and interface buses → master gain → compressor, plus a convolution reverb with a generated impulse response. `synth.ts` holds every recipe (no files). `score.ts` turns the schedule into timed musical cues; the scene feeds both the score and the choreography's effect cues through `CueScheduler`, which schedules each sound once, slightly ahead, at its exact time, with pan and distance taken from the camera.

## Interface (`src/ui`)

`ExperienceUI` reacts only to timeline phases and input. `MenuStateMachine` (pure) defines the allowed views (`intro`, `main`, `settings`, `credits`) and refuses to open a view while a transition runs, so rapid input cannot interleave transitions. Returning to the main menu is never delayed. `SettingsMenu` binds native radios and sliders and reports real status (active tier, audio state, system motion preference). `CreditsScreen` renders `credits.ts` and rolls it with the Web Animations API (compositor-driven, no second JavaScript loop).

PLAY is a disabled button whose enablement depends only on an `onPlay` handler passed to `ExperienceUI`. Adding gameplay means providing that handler (for example, a transition to the registered `world` scene) and a `world` view; the menu needs no rewrite.

## Quality and settings

`RenderProfile` (Low/Medium/High) sets the pixel-ratio cap, antialiasing (at context creation), shadows and shadow-map size, star and dust counts, noise octaves and ship detail density. `UserSettings` (v2) adds render scale, volume and motion preference. Stored data is validated field by field; the foundation's v1 entry migrates (`balanced` → `medium`).

## Cleanup

Each owner disposes what it creates: scenes track geometries, materials and textures in a `ResourceTracker`; the ship owns its own; listeners are removed in every `dispose`. Retry after a failed start disposes and rebuilds everything without duplicating the renderer or loop.
