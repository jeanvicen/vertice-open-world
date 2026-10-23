# Architecture

## Milestone boundary

This is the runnable rendering and lifecycle foundation for VÉRTICE, not a completed open-world game. The only playable environment is an original, low-detail procedural architectural blockout. Intro cinematics, a menu, authored models, streamed terrain, missions, animation, vehicles, physics, persistence of game progress, and audio are intentionally future work.

## Ownership and flow

`app/bootstrap.ts` imports the presentation styles and starts `App`. `App` owns the application lifetime and assembles the systems. `Game` owns a single `GameLoop`, `Renderer`, and `SceneManager`; the loop caps simulation steps to 50 ms and never launches an independent animation loop for a scene. `SceneManager` owns the active scene and explicitly calls its `enter`, `update`, `render`, and `exit` methods.

A scene creates and disposes the geometries and materials it owns. `World` owns a single environment root; it does not own shared renderer infrastructure. `InputSystem` owns and removes keyboard, pointer, touch-control and visibility listeners. `Renderer` owns its WebGL context, resize observer, context-loss listeners, tone-mapping, color-space, pixel-ratio cap and GPU renderer disposal. Failed renderer startup gets a user-readable recovery prompt; a browser WebGL context loss pauses simulation until the browser restores it.

`AssetManifest` is the source of truth for approved files beneath `public/assets`. `AssetLoader` reports actual per-file completion, retains diagnostic errors, and releases assets it owns. The initial manifest is empty because no production art was supplied. A loader that cannot parse font files explicitly rejects font requests rather than claiming otherwise.

Graphics preferences use validated, versioned, non-sensitive `localStorage` entries. Low, balanced and high presets set pixel-ratio and shadow defaults; users can lower render scale further. WebGL 2 support, graphics-driver memory, thermal throttling and mobile GPU performance vary by browser/device.

## Dependency direction

Application assembly imports core, rendering, scenes, systems and UI. Scenes may consume input and world helpers. Rendering depends on application settings, not on scenes. `World` and individual scenes do not create their own animation loops or WebGL contexts. Code does not depend on a backend, a cloud IDE GPU, a commercial service, or a game-engine runtime.

## Rendering choices

PBR materials use explicit roughness and low metalness, SRGB output, ACES filmic tone mapping and restrained directional plus hemispheric lighting. Scene fog provides distant depth. Shadows are enabled in balanced/high presets and disabled in low. No post-processing composer, bloom pass, physics library, WebGPU dependency or asset-download dependency is included until authored content and a measured need justify its cost.

## Future extension points

Add the cinematic introduction and independently implemented title/credits scenes through explicit `SceneManager.register` factories. Add entities and streamed sections behind world-level ownership. Add audio as an explicit gesture-authorized browser subsystem. Introduce an event bus only when multiple real consumers require decoupled events. Preserve cleanup ownership and profile on representative Android browsers before raising default render costs.
