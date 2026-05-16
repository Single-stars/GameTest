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

### Formal Round Registry Round 1

Completed after the full structure pass:

- Added `src/features/rounds/registry.ts` as the single declaration point for the 8 formal base round implementations.
- Preserved the formal round order:
  - reaction
  - aim
  - search
  - stroop
  - rhythm
  - memory
  - braking
  - patience
- Preserved the existing internal IDs, visible titles, dimension labels, rule copy, and action copy.
- Centralized the base implementation mapping:
  - reaction -> native reaction
  - aim -> native aim
  - search -> mini-game doodle
  - stroop -> mini-game fall-down
  - rhythm -> mini-game square-jump
  - memory -> mini-game flappy
  - braking -> native braking
  - patience -> mini-game knife
- Kept `src/features/game-flow/round-config.ts` as the compatibility adapter for the existing `rounds` shape used by the page.
- Kept `miniGameIdForBaseRound` exported for compatibility, but it now reads the registry instead of owning a separate hard-coded mapping.
- Updated the base `RoundRenderer` path to read `getRoundDefinition(round).base` before deciding whether to render a native round or `MiniGameBaseRound`.
- Left advanced challenges, scoring, storage, CSS, mini-game configs, and native component placement unchanged.

Verification added:

- Registry order and implementation mapping protection.
- `round-config` derives from `ROUND_DEFINITIONS`.
- `RoundRenderer` base path reads the registry instead of `miniGameIdForBaseRound`.
- Old `/mini-game-prototypes` and legacy fallback protections remain active.

Verification for this round:

- `npm.cmd test`: 176/176 passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; generated only `/` and `/_not-found`.
- `git diff --check`: passed.

### Formal Round Registry Round 2

Completed after Round 1 was committed and pushed:

- Added advanced implementation declarations to `src/features/rounds/registry.ts`.
- Preserved the formal round order, internal IDs, visible titles, dimension labels, rule copy, and action copy.
- Centralized the advanced implementation mapping:
  - reaction -> native advanced-reaction
  - aim -> native advanced-aim
  - search -> mini-game doodle
  - stroop -> mini-game fall-down
  - rhythm -> mini-game square-jump
  - memory -> mini-game flappy
  - braking -> native advanced-braking
  - patience -> mini-game knife
- Updated the advanced `RoundRenderer` path to read `getRoundDefinition(round).advanced` before deciding whether to render a native advanced round or `MiniGameAdvancedRound`.
- Kept `isMiniGameAdvancedConfig` as the runtime/type guard for mini-game advanced configs.
- Left advanced challenge config generation, scoring, storage, CSS, mini-game configs, and native advanced component behavior unchanged.

Verification added:

- Registry advanced mapping protection.
- `RoundRenderer` advanced path reads the registry instead of switching on `round`.
- Old `/mini-game-prototypes` and legacy fallback protections remain active.

Verification for this round:

- `node --test --experimental-strip-types src\lib\mini-game-prototypes.test.ts src\lib\obsolete-features.test.ts`: 88/88 passed.
- `npm.cmd test`: 177/177 passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; generated only `/` and `/_not-found`.
- `git diff --check`: passed.

### Page UI And Native Round Extraction

Completed after Formal Round Registry Round 2:

- Extracted result-related page UI from `src/app/page.tsx` into `src/features/results/`:
  - `src/features/results/result-screen.tsx`
  - `src/features/results/luck-draw-screen.tsx`
  - `src/features/results/restart-confirm-dialog.tsx`
  - `src/features/results/result-icons.tsx`
- Kept existing result copy, class names, selector usage, share-image behavior, radar chart usage, luck draw behavior, and restart-confirm behavior unchanged.
- Extracted advanced challenge page shell into `src/features/advanced/advanced-challenge-screen.tsx`.
- Kept `page.tsx` as the owner of app state, navigation state, `RoundRenderer`, advanced config evaluation, and callbacks.
- Extracted native round implementations into `src/features/rounds/native-rounds.tsx`:
  - `ReactionRound`
  - `AimRound`
  - `BrakingRound`
  - `AdvancedReactionRound`
  - `AdvancedAimRound`
  - `AdvancedBrakingRound`
  - `buildAdvancedPerfectTrials`
- Kept the registry mappings, native round behavior, mini-game round behavior, scoring, persistence, CSS, and formal route shape unchanged.
- Split architecture/source-slice guardrails into `src/lib/mini-game-architecture.test.ts` so `src/lib/mini-game-prototypes.test.ts` can focus on gameplay config/runtime expectations.

Verification for this round:

- `npm.cmd test`: 178/178 passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; generated only `/` and `/_not-found`.
- `git diff --check`: passed.

## Current Architecture Inventory

### `src/app/page.tsx`

Approximate role:

- Main application screen, formal route content, and top-level game state machine.
- Owns current stage, base round progression, advanced challenge state, result persistence, share flow, restart flow, and app back-navigation behavior.
- Contains the formal `RoundRenderer` glue that chooses native versus mini-game implementations from `src/features/rounds/registry.ts`.
- Delegates extracted UI/runtime blocks to feature modules:
  - result screens under `src/features/results/`
  - advanced challenge shell under `src/features/advanced/`
  - native round implementations under `src/features/rounds/native-rounds.tsx`
- Important boundaries:
  - Do not change `RoundRenderer` dispatch casually.
  - Do not change `src/features/rounds/registry.ts` mappings during structure refactor.
  - Do not change 8-round formal test order unless doing a separate product/gameplay task.

Current issue:

- Still owns the main app state machine and several page-level screens such as home, intro/play frame, and share-image screen.
- Future splits should keep navigation, persistence, and result/share behavior stable unless a separate product task explicitly changes them.

### `src/features/results/*`

Approximate role:

- Result-page presentation modules.
- Owns `ResultScreen`, `LuckDrawScreen`, `RestartConfirmDialog`, and small result action icons.
- Uses the existing `share-image.ts` and `radar-chart.tsx` helpers without changing their responsibilities.

Current issue:

- Should stay presentation-focused.
- Do not move top-level app stage transitions, persistence, or scoring ownership into these components during structure-only work.

### `src/features/advanced/advanced-challenge-screen.tsx`

Approximate role:

- Presentation shell for the advanced challenge screen.
- Receives challenge state, progress, callbacks, and a `renderRound` function from `page.tsx`.
- Does not own `RoundRenderer` or advanced challenge config generation.

Current issue:

- Keep it as a shell until there is a deliberate plan to move advanced state orchestration out of `page.tsx`.

### `src/features/rounds/native-rounds.tsx`

Approximate role:

- Owns the native React implementations for base and advanced native rounds:
  - reaction
  - aim
  - braking
- Owns native-round-local helpers needed by those components.
- Exports `buildAdvancedPerfectTrials` for advanced perfect-clear shortcuts.

Current issue:

- Treat this file as gameplay-sensitive.
- Any future split inside it should be tested carefully because it contains timer, pointer, hit-detection, and native-round completion payload logic.

### `src/app/mini-game-prototypes.tsx`

Approximate role:

- Public facade for the formal embedded mini-game runtime.
- Re-exports `MiniGameEmbeddedStage` from `src/features/mini-games/embedded-stage.tsx`.
- Re-exports `MiniGameCompletion` from `src/features/mini-games/common.tsx`.
- The actual per-game React runtimes now live under `src/features/mini-games/`.

Current issue:

- No longer a large runtime file.
- Keep it as a compatibility facade unless all imports have been migrated intentionally.

### `src/lib/mini-game-prototypes.ts`

Approximate role:

- Public facade for mini-game config and pure logic.
- Re-exports per-game logic from `src/lib/mini-games/*`.
- Used heavily by tests and app runtime.

Current issue:

- No longer owns all per-game code directly.
- Keep public exports stable unless a separate compatibility cleanup is planned.

### `src/app/globals.css`

Approximate role:

- Ordered CSS facade.
- Imports:
  - `src/app/styles/base-flow.css`
  - `src/app/styles/mini-games.css`
  - `src/app/styles/overlays-responsive.css`

Current issue:

- Keep import order stable.
- Active selectors should not be renamed during structure work.

### `src/features/rounds/registry.ts`

Approximate role:

- Single registry for formal round definitions.
- Declares the 8 formal round IDs, titles, dimension labels, rules, actions, base implementation type, and advanced implementation type.
- Separates formal round identity from implementation type:
  - native component
  - embedded mini-game

Current issue:

- Result labels still read through the existing `rounds` compatibility adapter.
- Advanced challenge config generation remains in `src/lib/advanced-challenges.ts`; the registry only declares the render implementation path.

### Tests

Important test files:

- `src/lib/mini-game-prototypes.test.ts`
- `src/lib/mini-game-architecture.test.ts`
- `src/lib/advanced-challenges.test.ts`
- `src/lib/scoring.test.ts`
- `src/lib/obsolete-features.test.ts`

Current issue:

- `src/lib/mini-game-architecture.test.ts` owns most source-slice architecture guardrails.
- `src/lib/mini-game-prototypes.test.ts` should stay focused on mini-game config/runtime expectations.
- Source-slice tests are useful as guardrails during refactor, but every extraction must update them carefully so they protect architecture rather than block harmless movement.

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

### Round 11: Formal Round Registry

Status: complete.

Target:

- Move the declaration of all 8 formal base round implementations into `src/features/rounds/registry.ts`.
- Keep the existing public `rounds` adapter and mini-game helper exports stable.
- Let the base `RoundRenderer` consult the registry for native versus mini-game implementation.

Risk:

- Formal round order, internal IDs, score dimensions, and display copy must not drift.
- Advanced challenge flow remains out of scope for this round.

### Round 12: Formal Round Registry Advanced Implementations

Status: complete.

Target:

- Add `advanced` implementation declarations to `src/features/rounds/registry.ts`.
- Keep native advanced components and mini-game advanced runtime behavior unchanged.
- Let the advanced `RoundRenderer` path consult the registry for native versus mini-game implementation.

Risk:

- Advanced config generation must remain unchanged.
- `MiniGameAdvancedRound` must still receive only configs validated by `isMiniGameAdvancedConfig`.

### Round 13: Page UI And Native Round Extraction

Status: complete.

Target:

- Move result-related UI out of `src/app/page.tsx`.
- Move the advanced challenge UI shell out of `src/app/page.tsx`.
- Move native round implementations out of `src/app/page.tsx`.
- Split architecture/source-slice tests away from gameplay config tests.

Risk:

- These components contain visible UI and gameplay-sensitive native rounds.
- Preserve class names, copy, callbacks, scoring payloads, registry mappings, CSS, and persistence contracts exactly.

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
| 11 | Complete | Formal base round implementations declared in `src/features/rounds/registry.ts`; base rendering reads registry. |
| 12 | Complete | Formal advanced round implementations declared in `src/features/rounds/registry.ts`; advanced rendering reads registry. |
| 13 | Complete | Result UI, advanced challenge shell, native rounds, and architecture tests extracted from `page.tsx` / mini-game test file. |

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
