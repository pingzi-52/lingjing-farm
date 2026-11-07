# Home Furniture Implementation Plan

> **For agentic workers:** Execute in this session against the user's approved fixed-layout design; research is delegated under feature-impl, implementation and browser acceptance owned by the primary agent.

**Goal:** Add eight coordinated cottage furnishings without blocking existing interactions.

**Architecture:** A pure furniture plan feeds a scene-owned HomeDecor renderer. Bed, chest, room bounds and save contracts remain in their existing modules.

**Tech Stack:** Phaser 3.90.0, TypeScript, Vitest, Vite; built-in image_gen for original RGBA atlas.

## Global Constraints

- Keep existing uncommitted changes; no commit/push/publication.
- Player body32×28, room x96/y80/320×272, bed350/160 and chest160/130 remain.
- Save V6 remains unchanged. New missing art must not create invisible collisions.
- Transparent source PNGs are copied unchanged; atlas JSON provides crops.

## Task 1: Assets and pure geometry

Files: `public/farm-assets/original-addons/v11/`, `src/game/systems/homeFurniturePlan.ts`, `tests/home-furniture.test.ts`, `tests/home-furniture-art.test.js`.

- [x] Save imagegen prompts, original atlas and provenance/hash. Read alpha bounds, write eight frame rectangles without editing image pixels.
- [x] Define furniture placements (bottom anchors), optional AABB footprints, and `getHomeFurnitureArt(kind, hasFrame)` returning atlas/frame or null.
- [x] Write and run failing geometry tests before implementation. Tests inflate each footprint by player halfsize16/14 and flood-fill at2px steps within center bounds112…400/94…338.
- [x] Assert spawn256/304 reaches chest176/178, bed306/190 and door256/326, while table/chair surfaces block entry and rug remains walkable.
- [x] Check frame bounds, RGBA PNG, frame names and independent missing-frame behavior.
- [x] Run `npm test -- tests/home-furniture.test.ts tests/home-furniture-art.test.js`.

## Task 2: Scene rendering

Files: `src/game/systems/HomeDecor.ts`, `src/game/scenes/HomeScene.ts`.

- [x] `HomeDecor.preload(scene)` registers the new atlas once with BASE_URL.
- [x] Constructor `(scene, player)` draws valid frames using equal-axis scale and feet anchors. Solid pieces receive static footprint rectangles plus player colliders; rug/shelf are decoration only.
- [x] Own and destroy all created images, rectangles, colliders and lamp glow. Never remove global atlas textures.
- [x] HomeScene calls preload, constructs after player, removes old southeast barrel and destroys decor on shutdown. Preserve existing sleepAndSave and chest interactions.
- [x] Run `npm run build` and inspect new source for duplicate helpers, unsafe frame access and unwanted domain/save changes.

## Task 3: Acceptance and documentation

Files: `docs/HOME_FURNITURE.md`, `docs/verification/home-furniture-checks.json`, `docs/screenshots/home-furniture-*.png`, `TASK_PROGRESS.md`, `README.md`.

- [x] Use isolated Chrome/temporary synthetic V6 progress on5177, expose game only in intercepted test entry and position fixtures explicitly. Actual E and menu clicks perform interactions.
- [x] Save before/after identical room view. Verify collisions, rug crossing, equal scaling, bed rest, chest transfers and refresh preserve progress.
- [x] Block atlas requests and test missing single frame separately; inspect no invisible new collision bodies.
- [x] Repeat home/farm transitions3times; compare bodies, colliders, scene-owned objects, E listeners and menu count. Check night/rain and no runtime errors.
- [x] Run `npm test`, `npm run build`, `git diff --check`; record actual counts and limitations. Shut down only temporary testing processes.
