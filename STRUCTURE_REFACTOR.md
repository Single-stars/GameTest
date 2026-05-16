# Structure Refactor Status

Last updated: 2026-05-16

This document is the handoff file for the code-structure refactor. Read it before making future refactor changes. The goal is to make the project clearer, easier to extend, and easier to maintain without changing gameplay, visual behavior, scoring, routes, or persisted data contracts.

## Current Git Baseline

- Branch: `main`
- Refactor start baseline after Round 1 push: `8bb2172 refactor: extract mini game common runtime`
- Earlier performance baseline: `a2147f7 perf: add mini game performance monitor`
- Current formal routes:
  - `/`
  - `/_not-found`
- The standalone `/mini-game-prototypes` route has been removed and must not be restored.
- `src/app/mini-game-prototypes.tsx` is still a formal embedded mini-game runtime and must not be deleted wholesale.

## Primary Rule

Refactor structure only. Do not change:

- game rules
- level order
- speeds
- gravity
- platform counts
- platform widths
- jump distances
- failure thresholds
- pass conditions
- score calculation
- advanced challenge configuration
- localStorage schema
- formal route mapping
- visible UI style

When a future change needs any of those, it is not part of this structure refactor and should be handled as a separate gameplay/design task.

## Work Already Completed

### Prototype Route And Obsolete UI Cleanup

- Removed the standalone prototype route.
- Removed old prototype selection/play shell UI that no longer had a formal entry.
- Kept `src/app/mini-game-prototypes.tsx` because it is now the embedded formal runtime.
- Kept `prototype-*` runtime CSS because the formal mini-games still use those selectors.
- Added/kept tests that protect against restoring `/mini-game-prototypes`.

### Old Fallback Round Cleanup

- Removed replaced legacy base fallback rounds:
  - `SearchRound`
  - `MemoryRound`
  - `PatienceRound`
- Removed replaced legacy advanced fallback rounds:
  - `AdvancedSearchRound`
  - `AdvancedMemoryRound`
  - `AdvancedPatienceRound`
- Formal base mappings now route through mini-games:
  - search -> doodle base
  - memory -> flappy base
  - patience -> knife base
  - rhythm -> square-jump base
  - stroop -> fall-down base
- Formal advanced mappings for those dimensions route through advanced mini-game configs.
- Scoring now treats replaced dimensions through mini-game payloads instead of old trial fallbacks.

### Gameplay Regression Repairs

- Restored active moving-target, arrow shot, and run-button CSS after old UI cleanup removed too much.
- Limited the doubled moving-target speed to base aim after the user clarified advanced aim must stay original.
- Fixed Fall Down base recovery in multiple rounds:
  - recoverable failure pauses/clears the respawn flash path
  - held input is re-applied after recovery
  - recovery spawn position is placed so the player remains movable
- Moved base aim target higher on screen.
- Changed braking feedback:
  - early release uses square flashing
  - danger collision uses red glow plus slight tilt instead of full red recolor
- Tuned Doodle platform generation toward more horizontal spread using deterministic noise.
- Improved mobile controls for Doodle/Fall Down/Square Jump, including touch continuity on alternating/held presses.
- Increased square speed for upward/downward movement levels where requested, including advanced variants.

### Performance Phase 0 + 1

- Added hidden mini-game performance panel gated by `?perf=1`.
- Panel is default-off and tracks:
  - FPS
  - average frame time
  - p95 frame time
  - worst frame time
  - dropped frames
  - update time
  - render/DOM write time
  - React sync count
- Metrics live in refs and panel UI updates at most every 500 ms.
- Reduced high-frequency React sync in Doodle, Fall Down, and Square Jump.
- Moved hot-path position writes toward `transform: translate3d(...)`.
- Replaced repeated `find(...)` DOM lookup paths with runtime maps/caches in hot painters where already completed.
- Commit pushed: `a2147f7 perf: add mini game performance monitor`.

### Structure Refactor Full Pass

Completed in the 2026-05-16 full structure pass:

- Kept `src/app/mini-game-prototypes.tsx` as a tiny public facade.
- Split the embedded mini-game runtime into feature modules:
  - `src/features/mini-games/common.tsx`
  - `src/features/mini-games/embedded-stage.tsx`
  - `src/features/mini-games/doodle.tsx`
  - `src/features/mini-games/flappy.tsx`
  - `src/features/mini-games/knife.tsx`
  - `src/features/mini-games/square-jump.tsx`
  - `src/features/mini-games/fall-down.tsx`
- Split pure mini-game config and logic while preserving the public facade `src/lib/mini-game-prototypes.ts`:
  - `src/lib/mini-games/shared.ts`
  - `src/lib/mini-games/doodle.ts`
  - `src/lib/mini-games/flappy.ts`
  - `src/lib/mini-games/knife.ts`
  - `src/lib/mini-games/square-jump.ts`
  - `src/lib/mini-games/fall-down.ts`
  - `src/lib/mini-games/catalog.ts`
- Split page-level responsibilities out of `src/app/page.tsx`:
  - `src/features/game-flow/round-config.ts`
  - `src/features/game-flow/mini-game-rounds.tsx`
  - `src/features/results/share-image.ts`
  - `src/features/results/radar-chart.tsx`
- Split global CSS by responsibility while preserving selector names and order:
  - `src/app/styles/base-flow.css`
  - `src/app/styles/mini-games.css`
  - `src/app/styles/overlays-responsive.css`
  - `src/app/globals.css` now imports those files in order.
- Added `allowImportingTsExtensions` to `tsconfig.json` so Node's native TypeScript test runner and Next's type checker agree on split `.ts` module imports.
- Updated source-level tests so they read the new feature modules and CSS chunks instead of assuming everything still lives in `page.tsx`, `mini-game-prototypes.tsx`, or `globals.css`.

Verification for the full pass:

- `npm.cmd test`: 174/174 passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; generated only `/` and `/_not-found`.
- Local HTTP check: `http://localhost:3000/` returned 200 after starting the dev server.

## Current Architecture Inventory

### `src/app/page.tsx`

Approximate role:

- Main application screen and formal game flow.
- Owns current formal route content.
- Contains formal round renderer, base rounds, advanced challenge flow, result flow, and UI shell.
- Important boundaries:
  - Do not change `RoundRenderer` dispatch casually.
  - Do not change `miniGameIdForBaseRound` mapping during structure refactor.
  - Do not change 8-round formal test order unless doing a separate product/gameplay task.

Current issue:

- Still too large and mixes app shell, round rendering, advanced flow, result UI, and some glue logic.
- Should be split only after the mini-game runtime is easier to reason about.

### `src/app/mini-game-prototypes.tsx`

Approximate role:

- Formal embedded mini-game runtime.
- Exports `MiniGameEmbeddedStage`.
- Contains shared constants/helpers/hooks and all current mini-game React runtimes:
  - Square Jump
  - Fall Down
  - Doodle
  - Flappy
  - Knife
- Contains runtime refs, RAF loops, DOM painters, input handlers, overlays, and performance panel usage.

Current issue:

- Too large and has mixed responsibilities.
- Shared runtime utilities, perf monitor, and five game implementations live in one file.
- This is the safest first extraction target because shared utilities can move without changing gameplay behavior.

### `src/lib/mini-game-prototypes.ts`

Approximate role:

- Mini-game config and pure logic layer.
- Owns generated layouts, config helpers, physics/planning helpers, and selectors for all mini-games.
- Used heavily by tests and app runtime.

Current issue:

- Too large and mixes all game config/generation/pure logic in one file.
- Should be split by game only after React runtime structure is cleaner and tests continue to prove behavior.

### `src/app/globals.css`

Approximate role:

- Global app styles plus formal flow styles plus all mini-game runtime styles.
- Contains active `prototype-*` and mini-game-specific classes used by formal embedded games.

Current issue:

- Too large and mixes unrelated UI systems.
- CSS splitting should happen late because many source tests and active runtime selectors depend on exact class names.

### Tests

Important test files:

- `src/lib/mini-game-prototypes.test.ts`
- `src/lib/advanced-challenges.test.ts`
- `src/lib/scoring.test.ts`
- `src/lib/obsolete-features.test.ts`

Current issue:

- Some tests are source-slice tests. They are useful as guardrails during refactor, but every extraction must update them carefully so they protect architecture rather than block harmless movement.

## Formal Boundaries To Preserve

These are considered stable public/internal contracts during structure refactor:

- `MiniGameEmbeddedStage`
- `MiniGameBaseRound`
- `MiniGameAdvancedRound`
- `RoundRenderer`
- `miniGameIdForBaseRound`
- `src/lib/scoring.ts`
- `src/lib/advanced-progress.ts`
- `src/lib/advanced-challenges.ts`
- `src/lib/mini-game-prototypes.ts` config and generation behavior
- current dimension IDs, score axes, result labels, and persisted keys
- `prototype-*` CSS used by active embedded mini-games

## Refactor Roadmap

### Round 0: Documentation And Baseline

Status: complete.

Purpose:

- Create this handoff document.
- Append current context to `task_plan.md`, `findings.md`, and `progress.md`.
- Confirm current baseline is readable for future sessions.

### Round 1: Extract Mini-Game Common Module

Status: complete.

Target:

- Create `src/features/mini-games/common.tsx`.
- Move shared types, dimensions, helper functions, low-power/FPS hooks, perf monitor, and `PrototypeEndOverlay`.
- Keep game implementations in `src/app/mini-game-prototypes.tsx` for now.

Expected code files:

- `src/features/mini-games/common.tsx`
- `src/app/mini-game-prototypes.tsx`
- `src/lib/mini-game-prototypes.test.ts`

Completed result:

- `src/features/mini-games/common.tsx` now owns shared dimensions, status/completion types, param helpers, transform helpers, low-power/FPS hooks, perf monitor code, perf panel UI, and `PrototypeEndOverlay`.
- `src/app/mini-game-prototypes.tsx` imports those shared utilities and still exports `MiniGameEmbeddedStage`.
- Existing `MiniGameCompletion` imports are preserved through a type re-export from `src/app/mini-game-prototypes.tsx`.
- Game components and gameplay state machines stayed in place.

Rules:

- No gameplay changes.
- No CSS changes unless a compile error proves it is required.
- No visual text/style changes.
- Add/update source-level proof tests before moving code.

### Round 2: Extract Embedded Stage Dispatcher

Status: complete.

Target:

- Move `MiniGameEmbeddedStage` and dispatch-only glue to a small module.
- Keep per-game components unchanged.

Risk:

- Formal flow imports depend on this export, so tests must prove the public import still works.

### Round 3: Extract Knife Runtime

Status: complete.

Reason to do early:

- Knife runtime is mostly self-contained and lower risk than the vertical-scroller games.

Target:

- Move Knife component, Knife-specific types/constants/helpers into a feature file.
- Keep shared helpers in common module.

### Round 4: Extract Flappy Runtime

Status: complete.

Reason:

- Flappy is also relatively contained.
- It uses generated gates and simple RAF/input behavior.

### Round 5: Extract Doodle Runtime

Status: complete.

Risk:

- Doodle has performance-sensitive RAF and DOM-painting paths.
- Must keep `?perf=1` behavior and mobile input behavior unchanged.

### Round 6: Extract Fall Down Runtime

Status: complete.

Risk:

- Fall Down has the most recent recovery/control bug history.
- Must preserve held-input recovery and pointer handling.

### Round 7: Extract Square Jump Runtime

Status: complete.

Risk:

- Square Jump has the most complex base-state machine, DOM painter, jump planning, and failure recovery.
- It should move after common patterns are proven by smaller game extractions.

### Round 8: Split Pure Mini-Game Logic By Game

Status: complete.

Target:

- Split `src/lib/mini-game-prototypes.ts` into per-game pure modules or internal helpers.
- Preserve existing public exports first.
- Only remove compatibility exports after tests and imports are clean.

### Round 9: Split `page.tsx`

Status: complete.

Target areas:

- App shell
- base round renderer
- advanced challenge flow
- result screen
- scoring/result glue

Risk:

- This touches formal flow and route behavior. Do after mini-game runtime is less tangled.

### Round 10: CSS Organization

Status: complete.

Target:

- Split CSS into coherent groups only after component files are split.
- Keep class names stable unless a separate visual cleanup is approved.

## Per-Round Checklist

For every structure refactor round:

1. State the intended approach before editing code.
2. Keep the round small; if more than 3 code files are needed, split or ask for approval.
3. Add or update a proof test first when practical.
4. Run the targeted test and confirm red when adding a new structural expectation.
5. Implement the smallest movement needed.
6. Run:
   - `npm.cmd test`
   - `npm.cmd run lint`
   - `npm.cmd run build`
7. Report:
   - files changed
   - what moved
   - what did not move
   - whether gameplay changed
   - whether visuals changed
   - test/lint/build results
   - `git status`

## Current Round Status

| Round | Status | Notes |
| --- | --- | --- |
| 0 | Complete | Handoff document and planning context created. |
| 1 | Complete | Common/perf utilities extracted to `src/features/mini-games/common.tsx`. |
| 2 | Complete | Embedded stage dispatcher moved to `src/features/mini-games/embedded-stage.tsx`; app facade preserved. |
| 3 | Complete | Knife runtime moved to `src/features/mini-games/knife.tsx`. |
| 4 | Complete | Flappy runtime moved to `src/features/mini-games/flappy.tsx`. |
| 5 | Complete | Doodle runtime moved to `src/features/mini-games/doodle.tsx`. |
| 6 | Complete | Fall Down runtime moved to `src/features/mini-games/fall-down.tsx`. |
| 7 | Complete | Square Jump runtime moved to `src/features/mini-games/square-jump.tsx`. |
| 8 | Complete | Pure mini-game lib logic split by game under `src/lib/mini-games/`; public facade preserved. |
| 9 | Complete | Page-level round config, mini-game round glue, share image generation, and radar chart extracted. |
| 10 | Complete | Global CSS split into imported responsibility chunks with selectors and order preserved. |

## Moved In Round 1

- `STAGE_WIDTH`
- `STAGE_HEIGHT`
- `PLAYER_SIZE`
- `DEBUG_MINI_GAME_FPS`
- `BASE_FAILURE_LIMIT`
- `MINI_GAME_UI_SYNC_MS`
- `MINI_GAME_TIMER_SYNC_MS`
- perf panel constants
- `PrototypeStatus`
- `MiniGameRunMode`
- `MiniGameCompletion`
- `clamp`
- `numberParam`
- `booleanParam`
- `transformPoint3d`
- `stagePointStyle`
- `useMiniGameLowPowerMode`
- `useMiniGameFpsCounter`
- `MiniGameFpsBadge`
- perf metric types/helpers
- `useMiniGamePerfMonitor`
- `MiniGamePerfPanel`
- `PrototypeEndOverlay`

## Kept In Place After Round 1

- all five game components
- all game-specific constants such as Knife/Flappy/Doodle movement constants
- all RAF/game state machines
- all DOM painters
- `MiniGameEmbeddedStage`
- `getMiniGameLevel` dispatch usage
- CSS
- pure config/generation logic in `src/lib/mini-game-prototypes.ts`

## Things That May Affect Gameplay And Should Not Move Yet

- Square Jump advance/miss/fly-away resolution
- Fall Down respawn and held-input recovery logic
- Doodle platform/hazard generation and runtime collision logic
- Knife shot geometry/outcome logic
- Flappy gate collision and gravity logic
- base/advanced completion payload shapes
- score payload construction
- any level param fallback values

## Resume Instructions For Future Sessions

Start by reading:

1. `STRUCTURE_REFACTOR.md`
2. `task_plan.md`
3. `findings.md`
4. `progress.md`

Then run:

```powershell
git status --short --branch
git diff --stat
```

If the working tree has unrelated changes, do not revert them. Work around them or ask before touching the same files.
