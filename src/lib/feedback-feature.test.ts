import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Cloudflare feedback endpoint stores validated text feedback without result payloads", () => {
  const workerSource = readSource("../../cloudflare/worker.ts");
  const wranglerSource = readSource("../../wrangler.worker.toml");
  const migrationUrl = new URL("../../cloudflare/migrations/0001_feedback.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  assert.match(workerSource, /FEEDBACK_DB:\s*D1Database/);
  assert.match(workerSource, /POST_FEEDBACK_ROUTE = "POST \/api\/feedback"/);
  assert.match(workerSource, /FEEDBACK_CONTENT_MAX_LENGTH = 250/);
  assert.match(workerSource, /type FeedbackCategory = "bug" \| "idea" \| "chat"/);
  assert.match(workerSource, /url\.pathname === "\/api\/feedback"/);
  assert.match(workerSource, /INSERT INTO feedback/);
  assert.doesNotMatch(workerSource, /includeResultData|include_result_data|rank_name|scores_json|total_score|feedback_result_json/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/feedback"/);
  assert.match(wranglerSource, /\[\[d1_databases\]\]/);
  assert.match(wranglerSource, /binding = "FEEDBACK_DB"/);
  assert.match(readFileSync(migrationUrl, "utf8"), /CREATE TABLE IF NOT EXISTS feedback/);
});

test("result screen feedback entry opens a 250 character text feedback modal", () => {
  const resultSource = readSource("../features/results/result-screen.tsx");
  const iconsSource = readSource("../features/results/result-icons.tsx");
  const resultCss = readSource("../app/styles/base-flow/results.css");

  assert.match(resultSource, /FeedbackIcon/);
  assert.match(resultSource, /id:\s*"feedback"/);
  assert.match(resultSource, /BUG反馈/);
  assert.match(resultSource, /贡献你的想法/);
  assert.match(resultSource, /和作者聊聊天/);
  assert.match(resultSource, /<div className="feedback-rating-row">[\s\S]*给游戏打个分[\s\S]*<div className="feedback-rating"/);
  assert.doesNotMatch(resultSource, /给作者打个分/);
  assert.match(resultSource, /谢谢你玩我的游戏！/);
  assert.match(resultSource, /maxLength=\{250\}/);
  assert.doesNotMatch(resultSource, /includeResultData|愿意附带本次结果数据|当前只发送/);
  assert.match(resultSource, /\/api\/feedback/);
  assert.ok(resultSource.indexOf('id: "donate"') < resultSource.indexOf('id: "feedback"'));
  assert.match(iconsSource, /feedback:/);
  assert.match(iconsSource, /export function FeedbackIcon/);
  assert.match(resultCss, /\.rank-avatar-menu-action\.tone-feedback/);
  assert.match(resultCss, /\.feedback-dialog/);
  assert.match(resultCss, /\.feedback-type-options/);
});
