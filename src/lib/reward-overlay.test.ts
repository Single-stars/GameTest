import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("endless unlock reward offers a direct challenge action", () => {
  const overlaySource = readFileSync(new URL("../features/rewards/reward-overlay.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/rewards.css", import.meta.url), "utf8");

  assert.match(overlaySource, /onStartEndlessChallenge: \(roundId: RoundId\) => void/);
  assert.match(overlaySource, /kind: "endless";[\s\S]*roundId: RoundId;[\s\S]*roundTitle: string;/);
  assert.match(overlaySource, /<button className="reward-endless-action" type="button" onClick=\{handleStartEndlessChallenge\}>/);
  assert.match(overlaySource, /前往挑战/);
  assert.match(pageSource, /const startUnlockedEndlessChallenge = useCallback/);
  assert.match(pageSource, /onStartEndlessChallenge=\{startUnlockedEndlessChallenge\}/);
  assert.match(cssSource, /\.reward-endless-action\s*{/);
});
