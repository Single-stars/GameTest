import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("result author note stays below the unchanged rank row", () => {
  const resultSource = readSource("../features/results/result-screen.tsx");
  const resultCss = readSource("../app/styles/base-flow/results.css");
  const responsiveCss = readSource("../app/styles/overlays-responsive.css");
  const noteButtonStart = resultSource.indexOf('className="rank-author-note"');
  const noteButtonEnd = resultSource.indexOf("</button>", noteButtonStart);
  const noteButton = resultSource.slice(noteButtonStart, noteButtonEnd);

  assert.match(resultSource, /className="rank-card-main"[\s\S]*className="rank-title"[\s\S]*className="rank-avatar-menu-wrap"/);
  assert.match(resultSource, /className="rank-author-note"/);
  assert.ok(resultSource.indexOf('className="rank-card-main"') < resultSource.indexOf('className="rank-author-note"'));
  assert.doesNotMatch(resultSource, /作者的话/);
  assert.doesNotMatch(resultSource, /rank-author-note-caret|typing-caret/);
  assert.match(resultSource, /AUTHOR_NOTE_TYPE_INTERVAL_MS = 82/);
  assert.match(resultSource, /AUTHOR_NOTE_TYPE_START_DELAY_MS = 100/);
  assert.doesNotMatch(resultSource, /AUTHOR_NOTE_CLICK_COOLDOWN_MS/);
  assert.doesNotMatch(resultSource, /AUTHOR_NOTE_MIN_REFRESH_LOCK_MS/);
  assert.match(resultSource, /getRandomResultAuthorNote/);
  assert.match(resultSource, /resultAuthorNoteHistoryByContext/);
  assert.match(resultSource, /getInitialResultAuthorNoteSelection/);
  assert.match(resultSource, /rememberResultAuthorNote/);
  assert.match(resultSource, /resultAuthorNoteHistoryByContext\.get\(contextKey\)/);
  assert.match(resultSource, /getRandomResultAuthorNote\(nextContext,\s*previousNoteId\)/);
  assert.match(resultSource, /useState<ResultAuthorNoteSelection>\(\(\) =>\s*getInitialResultAuthorNoteSelection/);
  assert.match(resultSource, /Math\.random/);
  assert.doesNotMatch(resultSource, /authorNoteFullyTyped/);
  assert.doesNotMatch(resultSource, /authorNoteCooldownUntilRef/);
  assert.doesNotMatch(resultSource, /authorNoteRefreshLockedRef/);
  assert.doesNotMatch(resultSource, /authorNoteUnlockTimerRef/);
  assert.doesNotMatch(resultSource, /authorNoteRefreshDisabled/);
  assert.doesNotMatch(resultSource, /setAuthorNoteRefreshLocked/);
  assert.doesNotMatch(noteButton, /disabled=/);
  assert.match(resultSource, /authorNoteText\.slice\(0,\s*1\)/);
  assert.match(resultSource, /setTypedAuthorNote\(\{\s*length:\s*Math\.min\(1,\s*nextNote\.text\.length\),\s*text:\s*nextNote\.text\s*}\)/);
  assert.match(resultSource, /window\.setTimeout\([\s\S]*AUTHOR_NOTE_TYPE_START_DELAY_MS/);
  assert.match(resultSource, /window\.setInterval\([\s\S]*AUTHOR_NOTE_TYPE_INTERVAL_MS/);
  const resultIndex = resultSource.indexOf("const result = getGameRankResult(trials);");
  const advancedUnlockedIndex = resultSource.indexOf("const advancedUnlocked =");
  const rowsIndex = resultSource.indexOf("const rows = [");
  const authorNoteStateIndex = resultSource.indexOf("useState<ResultAuthorNoteSelection>");
  const brakingFailuresIndex = resultSource.indexOf("const brakingFailures =");
  const dinoTrialsIndex = resultSource.indexOf("const dinoTrials =");
  assert.ok(resultIndex >= 0 && resultIndex < advancedUnlockedIndex);
  assert.ok(dinoTrialsIndex >= 0 && dinoTrialsIndex < brakingFailuresIndex);
  assert.ok(brakingFailuresIndex >= 0 && brakingFailuresIndex < rowsIndex);
  assert.ok(rowsIndex >= 0 && rowsIndex < authorNoteStateIndex);

  assert.match(resultCss, /\.rank-card-main\s*{[\s\S]*min-height:\s*76px;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(resultCss, /\.rank-card\s*{[\s\S]*min-height:\s*142px;[\s\S]*gap:\s*1px;[\s\S]*padding:\s*24px\s+24px\s+10px;/);
  assert.match(resultCss, /@media \(max-width:\s*640px\)\s*{[\s\S]*\.rank-card\s*{[\s\S]*min-height:\s*128px;[\s\S]*gap:\s*1px;[\s\S]*padding:\s*18px\s+16px\s+8px;[\s\S]*\.rank-card-main\s*{[\s\S]*min-height:\s*72px;/);
  assert.match(responsiveCss, /\.rank-card\s*{[\s\S]*min-height:\s*128px;[\s\S]*padding:\s*18px\s+16px\s+8px;/);
  assert.doesNotMatch(responsiveCss, /\.rank-card\s*{[\s\S]*padding:\s*22px\s+96px\s+22px\s+20px;/);
  assert.match(resultCss, /\.rank-author-note\s*{/);
  const noteRule = resultCss.match(/\.rank-author-note\s*{[\s\S]*?\n}/)?.[0] ?? "";
  assert.doesNotMatch(noteRule, /background|border|box-shadow/);
  assert.match(noteRule, /text-align:\s*left;/);
  assert.match(noteRule, /position:\s*relative;/);
  assert.match(noteRule, /top:\s*-3px;/);
  assert.doesNotMatch(resultCss, /\.rank-author-note:(hover|active)/);
});

test("result author note copy includes the approved trigger set", () => {
  const resultSource = readSource("../features/results/result-screen.tsx");

  assert.match(resultSource, /点击右侧的小方块可以重新测试~/);
  assert.match(resultSource, /帮忙分享这个游戏让更多人看到吧~/);
  assert.match(resultSource, /如果哪里做的不好，请在反馈里记录下来/);
  assert.match(resultSource, /想和朋友一起玩的话，点击小方块的联机功能/);
  assert.match(resultSource, /最强王者只是起点/);
  assert.match(resultSource, /点击分数卡片，可以进入对应进阶关/);
  assert.match(resultSource, /第一次通过新的进阶关会获得一枚幸运币/);
  assert.match(resultSource, /重玩已通关的进阶关不会重复获得幸运币/);
  assert.match(resultSource, /听说可以完成所有挑战的玩家不足万分之一/);
  assert.match(resultSource, /克服卡关的秘诀是换一关接着打/);
  assert.match(resultSource, /通过进阶前三关后将解锁无尽模式/);
  assert.match(resultSource, /无尽模式的特殊技能有什么作用呢\.\.\./);
  assert.match(resultSource, /在绿灯行的无尽模式预判点击的话\.\.\./);
  assert.match(resultSource, /分享无尽成绩后其他人就可以挑战你/);
  assert.match(resultSource, /作者其实没有通关过这个游戏/);
  assert.match(resultSource, /运气也是实力的一部分/);
  assert.match(resultSource, /运气达到最大值后，多余的幸运币也许有大用/);
  assert.match(resultSource, /小技巧：双手操控在一路向上关有奇效/);
  assert.match(resultSource, /小技巧：射靶子时计算提前量是必要的/);
  assert.match(resultSource, /受伤后的无敌帧是否可以利用呢？/);
  assert.match(resultSource, /火力全开意味着可以随便发射/);
  assert.match(resultSource, /皮肤【创意】可以制作你想要的任何皮肤/);
  assert.match(resultSource, /作者最喜欢的皮肤真的不是【猪猪】/);
  assert.match(resultSource, /这是个彩蛋嘻嘻\^_\^/);
  assert.match(resultSource, /谢谢你玩我的游戏/);
  assert.match(resultSource, /如果有更多人玩的话\.\.\./);
  assert.match(resultSource, /你能玩到这里，我真的很开心/);
  assert.match(resultSource, /段位只是游戏，不代表你哦/);
  assert.match(resultSource, /如果你愿意把这个游戏发给别人，我会非常感谢/);

  assert.match(resultSource, /trigger:\s*"not-king"/);
  assert.match(resultSource, /trigger:\s*"first-king"/);
  assert.match(resultSource, /trigger:\s*"king"/);
  assert.match(resultSource, /trigger:\s*"endless-unlocked"/);
  assert.match(resultSource, /trigger:\s*"endless-played"/);
  assert.match(resultSource, /trigger:\s*"luck-maxed"/);
  assert.match(resultSource, /trigger:\s*"rare"/);
  assert.match(resultSource, /trigger:\s*"always"/);
});
