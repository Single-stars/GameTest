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
  assert.match(workerSource, /GET_FEEDBACK_ADMIN_ROUTE = "GET \/api\/feedback\/admin"/);
  assert.match(workerSource, /GET_FEEDBACK_ANALYTICS_ROUTE = "GET \/api\/feedback\/admin\/analytics"/);
  assert.match(workerSource, /FEEDBACK_CONTENT_MAX_LENGTH = 250/);
  assert.match(workerSource, /type FeedbackCategory = "bug" \| "idea" \| "chat"/);
  assert.match(workerSource, /url\.pathname === "\/api\/feedback"/);
  assert.match(workerSource, /INSERT INTO feedback/);
  assert.match(workerSource, /FEEDBACK_ADMIN_TOKEN/);
  assert.match(workerSource, /CLOUDFLARE_ANALYTICS_TOKEN/);
  assert.match(workerSource, /httpRequests1dGroups/);
  assert.match(workerSource, /SELECT id, created_at, rating, category, content, page/);
  assert.doesNotMatch(workerSource, /includeResultData|include_result_data|rank_name|scores_json|total_score|feedback_result_json/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/feedback"/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/feedback\/\*"/);
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
  assert.doesNotMatch(resultSource, /feedback-privacy-note/);
  assert.match(resultSource, /已收到！谢谢你玩我的游戏~/);
  assert.match(resultSource, /maxLength=\{250\}/);
  assert.doesNotMatch(resultSource, /includeResultData|愿意附带本次结果数据|当前只发送/);
  assert.match(resultSource, /\/api\/feedback/);
  assert.ok(resultSource.indexOf('id: "feedback"') < resultSource.indexOf('id: "donate"'));
  assert.match(iconsSource, /feedback:/);
  assert.match(iconsSource, /export function FeedbackIcon/);
  assert.match(resultCss, /\.rank-avatar-menu-action\.tone-feedback/);
  assert.match(resultCss, /\.feedback-dialog/);
  assert.match(resultCss, /\.feedback-type-options/);
});

test("feedback admin page lists D1 feedback with rating and category filters", () => {
  const adminPageUrl = new URL("../app/admin/feedback/page.tsx", import.meta.url);
  const adminCssUrl = new URL("../app/admin/feedback/feedback-admin.module.css", import.meta.url);

  assert.equal(existsSync(adminPageUrl), true);
  assert.equal(existsSync(adminCssUrl), true);

  const adminSource = readFileSync(adminPageUrl, "utf8");
  const adminCss = readFileSync(adminCssUrl, "utf8");

  assert.match(adminSource, /\/api\/feedback\/admin/);
  assert.match(adminSource, /x-admin-token/);
  assert.match(adminSource, /feedback-admin-token/);
  assert.match(adminSource, /评分/);
  assert.match(adminSource, /类型/);
  assert.match(adminSource, /BUG反馈/);
  assert.match(adminSource, /贡献想法/);
  assert.match(adminSource, /和作者聊天/);
  assert.match(adminSource, /平均评分/);
  assert.match(adminSource, /总反馈/);
  assert.match(adminSource, /访问概览/);
  assert.match(adminSource, /刷新访问数据/);
  assert.match(adminSource, /近7天访客/);
  assert.match(adminSource, /最新一天访客/);
  assert.match(adminSource, /getAdminApiUrl\("\/analytics"\)/);
  assert.match(adminCss, /\.dashboard/);
  assert.match(adminCss, /\.analyticsPanel/);
  assert.match(adminCss, /\.filters/);
  assert.match(adminCss, /\.feedbackList/);
});

test("home screen requires privacy and disclaimer confirmation before starting", () => {
  const appPageSource = readSource("../app/page.tsx");
  const homeScreenSource = readSource("../features/game-flow/home-screen.tsx");
  const homeIntroCss = readSource("../app/styles/base-flow/home-intro.css");
  const consentPanel = homeScreenSource.match(/<section className="home-consent-panel"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(appPageSource, /const \[homeConsentAccepted, setHomeConsentAccepted\] = useState\(false\)/);
  assert.match(appPageSource, /<HomeScreen[\s\S]*consentAccepted=\{homeConsentAccepted\}[\s\S]*onConsentChange=\{setHomeConsentAccepted\}/);
  assert.match(homeScreenSource, /home-consent-panel/);
  assert.match(homeScreenSource, /type="checkbox"/);
  assert.match(homeScreenSource, /data-consent-ready=\{consentAccepted \? "true" : "false"\}/);
  assert.doesNotMatch(homeScreenSource, /\sdisabled=\{!consentAccepted\}/);
  assert.doesNotMatch(homeScreenSource, /aria-disabled=\{!consentAccepted\}/);
  assert.match(homeScreenSource, /home-consent-toast/);
  assert.match(homeScreenSource, /setTimeout\(\(\) => setConsentWarningId\(0\), 1800\)/);
  assert.match(homeScreenSource, /请先勾选隐私与免责声明/);
  assert.match(homeScreenSource, /home-disclaimer-screen/);
  assert.match(homeScreenSource, /home-disclaimer-link/);
  assert.match(homeScreenSource, /本测试仅供娱乐，不是专业能力、心理、医疗、教育或职业评估/);
  assert.match(homeScreenSource, /测试结果只代表本次浏览器操作表现/);
  assert.match(homeScreenSource, /localStorage/);
  assert.match(homeScreenSource, /创意皮肤图片会裁剪压缩后保存在本机浏览器 IndexedDB/);
  assert.match(homeScreenSource, /网页只能在你主动选择图片后读取该图片/);
  assert.match(homeScreenSource, /联机使用创意皮肤时，头像图片可能通过点对点连接临时发送给对方显示/);
  assert.match(homeScreenSource, /分享图片在本机浏览器生成/);
  assert.match(homeScreenSource, /反馈功能会提交反馈文本、评分、反馈类型、页面信息和浏览器 user-agent/);
  assert.match(homeScreenSource, /请勿在反馈中填写手机号、微信、真实姓名、身份证、地址等敏感信息/);
  assert.match(homeScreenSource, /开始测试即代表确认以上说明/);
  assert.doesNotMatch(consentPanel, /本测试仅供娱乐/);
  assert.match(homeIntroCss, /\.home-consent-panel/);
  assert.match(homeIntroCss, /\.home-consent-check/);
  assert.match(homeIntroCss, /\.home-consent-toast\s*\{[\s\S]*position:\s*fixed;/);
  assert.doesNotMatch(homeIntroCss, /\.home-consent-warning/);
  assert.match(homeIntroCss, /\.home-disclaimer-screen/);
});
