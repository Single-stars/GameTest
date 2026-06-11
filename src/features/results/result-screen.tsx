"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { getAdvancedDimensionLevel, getAdvancedLevelTone, getLuckDrawStatusText, getLuckLevelTone, getAdvancedTotalStars, formatResultRankTitle, type AdvancedProgress } from "@/lib/advanced-progress";
import { getGameRankResult, type RoundId, type TrialEvent } from "@/lib/scoring";
import { ROUND_DISPLAY_BY_ID } from "@/lib/round-display";
import { RadarChart } from "@/features/results/radar-chart";
import { AvatarLabIcon, DonateIcon, FeedbackIcon, HomeworldIcon, MultiplayerIcon, RestartIcon, ResetDataIcon, ShareIcon } from "@/features/results/result-icons";
import { PlayerAvatar, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";

type ImageShareState = "idle" | "sharing" | "saved" | "failed";
type FeedbackCategory = "bug" | "idea" | "chat";
type FeedbackSubmitState = "idle" | "submitting" | "sent" | "failed";
type DonatePlatformId = "alipay" | "wechat";
type DonationFeedId = "mixue" | "porkRice" | "free";
type DonationFeedOption = {
  id: DonationFeedId;
  label: string;
  note: string;
  qrImages: Record<DonatePlatformId, string>;
};
type AvatarMenuItem = {
  id: "share" | "restart" | "reset" | "homeworld" | "skin" | "donate" | "feedback" | "multiplayer";
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  tone: "share" | "restart" | "skin" | "donate" | "homeworld" | "reset" | "feedback" | "multiplayer";
  disabled?: boolean;
  danger?: boolean;
};
type ResultAuthorNoteTrigger =
  | "always"
  | "not-king"
  | "king-entry"
  | "advanced-active"
  | "advanced-complete"
  | "endless-unlocked"
  | "endless-played"
  | "luck-maxed"
  | "rare";
type ResultAuthorNote = {
  id: string;
  text: string;
  trigger: ResultAuthorNoteTrigger;
  priority?: number;
};
type ResultAuthorNoteContext = {
  advancedActive: boolean;
  advancedComplete: boolean;
  endlessPlayed: boolean;
  endlessUnlocked: boolean;
  isKingRank: boolean;
  kingEntry: boolean;
  luckMaxed: boolean;
  rareEnabled: boolean;
};
type ResultAuthorNoteSelection = { contextKey: string; includeRare: boolean; noteId: string | null };

const AVATAR_LAB_ENTRY_ANIMATION_MS = 560;
const FEEDBACK_CONTENT_MAX_LENGTH = 250;
const AUTHOR_NOTE_TYPE_INTERVAL_MS = 82;
const AUTHOR_NOTE_TYPE_START_DELAY_MS = 100;
const resultAuthorNoteHistoryByContext = new Map<string, string>();
const RESULT_AUTHOR_NOTES: ReadonlyArray<ResultAuthorNote> = [
  { id: "retry-after-non-king", text: "点击右侧的小方块可以重新测试~", trigger: "not-king", priority: 160 },
  { id: "advanced-after-non-king", text: "达到最强王者后开启进阶百星挑战", trigger: "not-king", priority: 150 },
  { id: "share-game", text: "帮忙分享这个游戏让更多人看到吧~", trigger: "always" },
  { id: "feedback-record", text: "如果哪里做的不好，请在反馈里记录下来", trigger: "always" },
  { id: "multiplayer-friends", text: "想和朋友一起玩的话，点击小方块的联机功能", trigger: "always" },
  { id: "king-start", text: "最强王者只是起点，进阶百星挑战已开启", trigger: "king-entry", priority: 140 },
  { id: "advanced-complete", text: "传奇王者达成，百星挑战已完成", trigger: "advanced-complete", priority: 180 },
  { id: "score-card-advanced", text: "点击分数卡片，可以进入对应进阶关", trigger: "advanced-active", priority: 80 },
  { id: "new-advanced-luck-coin", text: "第一次通过新的进阶关会获得一枚幸运币", trigger: "advanced-active" },
  { id: "replay-no-coin", text: "重玩已通关的进阶关不会重复获得幸运币", trigger: "advanced-active" },
  { id: "all-challenges-rare", text: "听说可以完成所有挑战的玩家不足万分之一", trigger: "always" },
  { id: "switch-stuck-stage", text: "克服卡关的秘诀是换一关接着打", trigger: "advanced-active" },
  { id: "unlock-endless", text: "通过进阶前三关后将解锁无尽模式", trigger: "advanced-active" },
  { id: "endless-special-skill", text: "无尽模式的特殊技能有什么作用呢...", trigger: "endless-unlocked" },
  { id: "green-light-predict", text: "在绿灯行的无尽模式预判点击的话...", trigger: "endless-unlocked" },
  { id: "share-endless-challenge", text: "分享无尽成绩后其他人就可以挑战你", trigger: "endless-played" },
  { id: "author-not-cleared", text: "作者其实没有通关过这个游戏", trigger: "endless-unlocked" },
  { id: "luck-is-power", text: "运气也是实力的一部分", trigger: "advanced-active" },
  { id: "extra-luck-coins", text: "运气达到最大值后，多余的幸运币也许有大用", trigger: "luck-maxed", priority: 70 },
  { id: "two-hand-square-jump", text: "小技巧：双手操控在一路向上关有奇效", trigger: "always" },
  { id: "aim-leading", text: "小技巧：射靶子时计算提前量是必要的", trigger: "always" },
  { id: "invincible-frames", text: "受伤后的无敌帧是否可以利用呢？", trigger: "always" },
  { id: "full-fire", text: "火力全开意味着可以随便发射", trigger: "always" },
  { id: "creative-skin", text: "皮肤【创意】可以制作你想要的任何皮肤", trigger: "always" },
  { id: "not-pig-favorite", text: "作者最喜欢的皮肤真的不是【猪猪】", trigger: "always" },
  { id: "easter-egg", text: "这是个彩蛋嘻嘻^_^", trigger: "rare" },
  { id: "thanks-playing", text: "谢谢你玩我的游戏", trigger: "always" },
  { id: "more-players", text: "如果有更多人玩的话...", trigger: "always" },
  { id: "happy-you-played", text: "你能玩到这里，我真的很开心", trigger: "rare" },
  { id: "rank-not-you", text: "段位只是游戏，不代表你哦", trigger: "always" },
  { id: "share-thanks", text: "如果你愿意把这个游戏发给别人，我会非常感谢", trigger: "always" },
];
const DONATION_FEED_OPTIONS = [
  {
    id: "mixue",
    label: "蜜雪冰城",
    note: "清凉补给",
    qrImages: {
      alipay: "/donate/alipay-pay-mixue-6-yuan.jpg",
      wechat: "/donate/wechat-pay-mixue-6-yuan.png",
    },
  },
  {
    id: "porkRice",
    label: "大份猪脚饭",
    note: "回血套餐",
    qrImages: {
      alipay: "/donate/alipay-pay-pork-rice-18-yuan.jpg",
      wechat: "/donate/wechat-pay-pork-rice-18-yuan.png",
    },
  },
  {
    id: "free",
    label: "随意加餐",
    note: "能吃就行",
    qrImages: {
      alipay: "/donate/alipay-pay-free.jpg",
      wechat: "/donate/wechat-pay-free.png",
    },
  },
] as const satisfies ReadonlyArray<DonationFeedOption>;
const DONATION_PLATFORMS = [
  { id: "alipay", label: "支付宝收款码", appName: "支付宝" },
  { id: "wechat", label: "微信收款码", appName: "微信" },
] as const satisfies ReadonlyArray<{ id: DonatePlatformId; label: string; appName: string }>;
const FEEDBACK_TYPES = [
  { id: "bug", label: "BUG反馈" },
  { id: "idea", label: "贡献你的想法" },
  { id: "chat", label: "和作者聊聊天" },
] as const satisfies ReadonlyArray<{ id: FeedbackCategory; label: string }>;
const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

function canShowResultAuthorNote(note: ResultAuthorNote, context: ResultAuthorNoteContext) {
  switch (note.trigger) {
    case "not-king":
      return !context.isKingRank;
    case "king-entry":
      return context.kingEntry;
    case "advanced-active":
      return context.advancedActive;
    case "advanced-complete":
      return context.advancedComplete;
    case "endless-unlocked":
      return context.endlessUnlocked && !context.advancedComplete;
    case "endless-played":
      return context.endlessPlayed;
    case "luck-maxed":
      return context.luckMaxed && !context.advancedComplete;
    case "rare":
      return context.rareEnabled;
    case "always":
      return true;
  }
}

function getEligibleResultAuthorNotes(context: ResultAuthorNoteContext) {
  return RESULT_AUTHOR_NOTES.filter((note) => canShowResultAuthorNote(note, context));
}

function getDefaultResultAuthorNote(context: ResultAuthorNoteContext) {
  const eligibleNotes = getEligibleResultAuthorNotes(context);
  if (eligibleNotes.length === 0) return RESULT_AUTHOR_NOTES[0];
  return [...eligibleNotes].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
}

function getResultAuthorNote(context: ResultAuthorNoteContext, noteId: string | null) {
  const eligibleNotes = RESULT_AUTHOR_NOTES.filter((note) => canShowResultAuthorNote(note, context));
  if (eligibleNotes.length === 0) return RESULT_AUTHOR_NOTES[0];
  return eligibleNotes.find((note) => note.id === noteId) ?? getDefaultResultAuthorNote(context);
}

function getRandomResultAuthorNote(context: ResultAuthorNoteContext, currentNoteId: string | null) {
  const eligibleNotes = getEligibleResultAuthorNotes(context);
  if (eligibleNotes.length === 0) return RESULT_AUTHOR_NOTES[0];
  const nextNotes = eligibleNotes.length > 1 ? eligibleNotes.filter((note) => note.id !== currentNoteId) : eligibleNotes;
  return nextNotes[Math.floor(Math.random() * nextNotes.length)] ?? eligibleNotes[0];
}

function getInitialResultAuthorNoteSelection(contextKey: string, context: ResultAuthorNoteContext): ResultAuthorNoteSelection {
  return { contextKey, includeRare: false, noteId: getDefaultResultAuthorNote(context).id };
}

function rememberResultAuthorNote(contextKey: string, noteId: string) {
  resultAuthorNoteHistoryByContext.set(contextKey, noteId);
}

function roundFailureCount(trials: TrialEvent[], roundId: RoundId) {
  const roundTrials = trials.filter((item) => item.roundId === roundId);
  if (roundTrials.length === 0) return null;

  const reportedFailures = roundTrials
    .map((item) => Number(item.value?.failures))
    .find((value) => Number.isFinite(value));

  if (reportedFailures !== undefined) return Math.max(0, Math.round(reportedFailures));
  return roundTrials.filter((item) => item.correct === false).length;
}

export function ResultScreen({
  advancedProgress,
  avatarSkin,
  trials,
  advancedUnlockPulseId,
  imageShareState,
  debugToolsVisible,
  homeworldEntryVisible,
  onOpenAdvancedChallenge,
  onOpenAvatarLab,
  onOpenHomeworld,
  onOpenLuckDraw,
  onOpenMultiplayer,
  onConfirmDonateAuthor,
  onResetTestData,
  onShareImage,
  onRestart,
}: {
  advancedProgress: AdvancedProgress;
  avatarSkin: PlayerAvatarSkin;
  trials: TrialEvent[];
  advancedUnlockPulseId: number;
  imageShareState: ImageShareState;
  debugToolsVisible: boolean;
  homeworldEntryVisible: boolean;
  onOpenAdvancedChallenge: (roundId: RoundId) => void;
  onOpenAvatarLab: () => void;
  onOpenHomeworld: () => void;
  onOpenLuckDraw: () => void;
  onOpenMultiplayer: () => void;
  onConfirmDonateAuthor: () => void;
  onResetTestData: () => void;
  onShareImage: () => void;
  onRestart: () => void;
}) {
  const result = getGameRankResult(trials);
  const brakingTrials = trials.filter((item) => item.roundId === "braking");
  const dinoTrials = brakingTrials.filter((item) => item.value?.mode === "dino" || item.value?.signal === "threat");
  const aimMisses = result.metrics.aimTotal > 0 ? Math.max(0, result.metrics.aimTotal - result.metrics.aimHits) : null;
  const stroopFailures = roundFailureCount(trials, "stroop");
  const rhythmFailures = roundFailureCount(trials, "rhythm");
  const memoryFailures = roundFailureCount(trials, "memory");
  const patienceFailures = roundFailureCount(trials, "patience");
  const brakingFailures =
    dinoTrials.length > 0
      ? dinoTrials.filter((item) => item.correct !== true && item.value?.safeStop !== true).length
      : brakingTrials.length > 0
        ? brakingTrials.filter((item) => item.correct === false).length
        : null;
  const advancedUnlocked = advancedProgress.unlocked || result.name === "最强王者";
  const advancedStars = getAdvancedTotalStars(advancedProgress);
  const rankTitle = formatResultRankTitle(result.name, advancedStars);
  const luckStatus = getLuckDrawStatusText(advancedUnlocked, advancedProgress);
  const rows = [
    {
      roundId: "reaction",
      label: ROUND_DISPLAY_BY_ID.reaction.label,
      score: result.scores.reaction,
      detail: result.metrics.reactionMedianMs ? `${Math.round(result.metrics.reactionMedianMs)}ms` : "不足",
    },
    {
      roundId: "aim",
      label: ROUND_DISPLAY_BY_ID.aim.label,
      score: result.scores.precision,
      detail: aimMisses !== null ? `未命中 ${aimMisses}` : "不足",
    },
    {
      roundId: "stroop",
      label: ROUND_DISPLAY_BY_ID.stroop.label,
      score: result.scores.focus,
      detail: stroopFailures !== null ? `失误 ${stroopFailures}` : "不足",
    },
    {
      roundId: "search",
      label: ROUND_DISPLAY_BY_ID.search.label,
      score: result.scores.positioning,
      detail: result.metrics.positioningAccuracy !== null ? `失误 ${result.metrics.positioningFailures}` : "不足",
    },
    {
      roundId: "rhythm",
      label: ROUND_DISPLAY_BY_ID.rhythm.label,
      score: result.scores.feel,
      detail: rhythmFailures !== null ? `失误 ${rhythmFailures}` : "不足",
    },
    {
      roundId: "memory",
      label: ROUND_DISPLAY_BY_ID.memory.label,
      score: result.scores.coordination,
      detail: memoryFailures !== null ? `失误 ${memoryFailures}` : "不足",
    },
    {
      roundId: "braking",
      label: ROUND_DISPLAY_BY_ID.braking.label,
      score: result.scores.control,
      detail: brakingFailures !== null ? `失误 ${brakingFailures}` : "不足",
    },
    {
      roundId: "patience",
      label: ROUND_DISPLAY_BY_ID.patience.label,
      score: result.scores.timing,
      detail: patienceFailures !== null ? `失误 ${patienceFailures}` : "不足",
    },
  ] as const satisfies ReadonlyArray<{ roundId: RoundId; label: string; score: number; detail: string }>;
  const endlessUnlocked = rows.some((row) => getAdvancedDimensionLevel(advancedProgress, row.roundId) >= 3);
  const endlessPlayed = rows.some((row) => (advancedProgress.endlessBestScores[row.roundId] ?? 0) > 0);
  const authorNoteContextKey = [
    advancedUnlocked,
    advancedStars,
    endlessPlayed,
    endlessUnlocked,
    result.name === "最强王者",
    advancedProgress.luckStars >= 20 || advancedProgress.luckBestScore >= 100,
  ].join(":");
  const baseAuthorNoteContext = {
    advancedActive: result.name === "最强王者" && advancedStars > 0 && advancedStars < 100,
    advancedComplete: advancedStars >= 100,
    endlessPlayed,
    endlessUnlocked,
    isKingRank: result.name === "最强王者",
    kingEntry: result.name === "最强王者" && advancedStars === 0,
    luckMaxed: advancedProgress.luckStars >= 20 || advancedProgress.luckBestScore >= 100,
    rareEnabled: false,
  } satisfies ResultAuthorNoteContext;
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarMenuFeedback, setAvatarMenuFeedback] = useState(false);
  const [donatePanelOpen, setDonatePanelOpen] = useState(false);
  const [donateConfirmed, setDonateConfirmed] = useState(false);
  const [donateActionReady, setDonateActionReady] = useState(false);
  const [selectedDonationFeedId, setSelectedDonationFeedId] = useState<DonationFeedOption["id"] | null>(null);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<(typeof FEEDBACK_RATINGS)[number]>(5);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("idea");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackSubmitState, setFeedbackSubmitState] = useState<FeedbackSubmitState>("idle");
  const [feedbackError, setFeedbackError] = useState("");
  const [authorNoteSelection, setAuthorNoteSelection] = useState<ResultAuthorNoteSelection>(() =>
    getInitialResultAuthorNoteSelection(authorNoteContextKey, baseAuthorNoteContext),
  );
  const [typedAuthorNote, setTypedAuthorNote] = useState({ length: 0, text: "" });
  const avatarEntryTimerRef = useRef<number | null>(null);
  const donateSaveIntentTimerRef = useRef<number | null>(null);
  const selectedDonationFeed = selectedDonationFeedId ? DONATION_FEED_OPTIONS.find((item) => item.id === selectedDonationFeedId) ?? null : null;

  const clearAvatarEntryTimer = useCallback(() => {
    if (avatarEntryTimerRef.current !== null) {
      window.clearTimeout(avatarEntryTimerRef.current);
      avatarEntryTimerRef.current = null;
    }
  }, []);

  const clearDonateSaveIntentTimer = useCallback(() => {
    if (donateSaveIntentTimerRef.current !== null) {
      window.clearTimeout(donateSaveIntentTimerRef.current);
      donateSaveIntentTimerRef.current = null;
    }
  }, []);

  const markDonateActionReady = useCallback(() => {
    if (!selectedDonationFeedId) return;
    clearDonateSaveIntentTimer();
    setDonateActionReady(true);
  }, [clearDonateSaveIntentTimer, selectedDonationFeedId]);

  useEffect(() => clearAvatarEntryTimer, [clearAvatarEntryTimer]);
  useEffect(() => clearDonateSaveIntentTimer, [clearDonateSaveIntentTimer]);

  useEffect(() => {
    if (!donatePanelOpen || !selectedDonationFeedId) return;

    const markAfterLeaving = () => markDonateActionReady();
    const markWhenHidden = () => {
      if (document.visibilityState === "hidden") markDonateActionReady();
    };

    document.addEventListener("visibilitychange", markWhenHidden);
    window.addEventListener("pagehide", markAfterLeaving);
    window.addEventListener("blur", markAfterLeaving);

    return () => {
      document.removeEventListener("visibilitychange", markWhenHidden);
      window.removeEventListener("pagehide", markAfterLeaving);
      window.removeEventListener("blur", markAfterLeaving);
    };
  }, [donatePanelOpen, markDonateActionReady, selectedDonationFeedId]);

  const runAvatarMenuAction = useCallback(
    (action: () => void) => {
      if (avatarMenuFeedback) return;
      clearAvatarEntryTimer();
      setAvatarMenuOpen(false);
      setAvatarMenuFeedback(true);
      avatarEntryTimerRef.current = window.setTimeout(() => {
        avatarEntryTimerRef.current = null;
        setAvatarMenuFeedback(false);
        action();
      }, AVATAR_LAB_ENTRY_ANIMATION_MS);
    },
    [avatarMenuFeedback, clearAvatarEntryTimer],
  );

  const toggleAvatarMenu = useCallback(() => {
    if (avatarMenuFeedback) return;
    clearAvatarEntryTimer();
    setAvatarMenuOpen((current) => !current);
  }, [avatarMenuFeedback, clearAvatarEntryTimer]);

  const closeAvatarMenuFromOutside = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!avatarMenuOpen || avatarMenuFeedback) return;
      const menuWrap = event.currentTarget.querySelector(".rank-avatar-menu-wrap");
      if (event.target instanceof Node && menuWrap?.contains(event.target)) return;
      setAvatarMenuOpen(false);
    },
    [avatarMenuFeedback, avatarMenuOpen],
  );

  const avatarEntryAction = avatarMenuFeedback ? "celebrate" : avatarMenuOpen ? "wonder" : "idle";
  const avatarEntryEffect = avatarMenuOpen && !avatarMenuFeedback ? "question" : "none";
  const avatarEntryExpression = avatarMenuFeedback ? "happy" : "neutral";

  const openDonatePanel = useCallback(() => {
    clearAvatarEntryTimer();
    clearDonateSaveIntentTimer();
    setAvatarMenuOpen(false);
    setDonateConfirmed(false);
    setDonateActionReady(false);
    setSelectedDonationFeedId(null);
    setDonatePanelOpen(true);
  }, [clearAvatarEntryTimer, clearDonateSaveIntentTimer]);

  const confirmDonate = useCallback(() => {
    onConfirmDonateAuthor();
    setDonateConfirmed(true);
  }, [onConfirmDonateAuthor]);

  const openFeedbackPanel = useCallback(() => {
    setFeedbackPanelOpen(true);
    setFeedbackSubmitState("idle");
    setFeedbackError("");
  }, []);

  const closeFeedbackPanel = useCallback(() => {
    if (feedbackSubmitState === "submitting") return;
    setFeedbackPanelOpen(false);
  }, [feedbackSubmitState]);

  const submitFeedback = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = feedbackContent.trim();
      if (!content) {
        setFeedbackSubmitState("failed");
        setFeedbackError("写一句再发送。");
        return;
      }
      if (content.length > FEEDBACK_CONTENT_MAX_LENGTH) {
        setFeedbackSubmitState("failed");
        setFeedbackError("最多 250 字。");
        return;
      }

      setFeedbackSubmitState("submitting");
      setFeedbackError("");

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            category: feedbackCategory,
            content,
            page: "result",
            rating: feedbackRating,
          }),
        });

        if (!response.ok) throw new Error("feedback-submit-failed");
        setFeedbackContent("");
        setFeedbackSubmitState("sent");
      } catch {
        setFeedbackSubmitState("failed");
        setFeedbackError("没发出去，稍后再试。");
      }
    },
    [feedbackCategory, feedbackContent, feedbackRating],
  );

  const avatarMenuItems = [
    {
      id: "share",
      label: "生成分享图片",
      icon: <ShareIcon />,
      disabled: imageShareState === "sharing",
      tone: "share",
      onSelect: onShareImage,
    },
    {
      id: "restart",
      label: "重新测试",
      icon: <RestartIcon />,
      tone: "restart",
      onSelect: onRestart,
    },
    {
      id: "skin",
      label: "皮肤动作测试",
      icon: null,
      tone: "skin",
      onSelect: onOpenAvatarLab,
    },
    {
      id: "multiplayer",
      label: "联机",
      icon: <MultiplayerIcon />,
      tone: "multiplayer",
      onSelect: onOpenMultiplayer,
    },
    {
      id: "feedback",
      label: "反馈",
      icon: <FeedbackIcon />,
      tone: "feedback",
      onSelect: openFeedbackPanel,
    },
    {
      id: "donate",
      label: "投喂",
      icon: <DonateIcon />,
      tone: "donate",
      onSelect: openDonatePanel,
    },
    ...(homeworldEntryVisible
      ? [
          {
            id: "homeworld" as const,
            label: "家园",
            icon: <HomeworldIcon />,
            tone: "homeworld" as const,
            onSelect: onOpenHomeworld,
          },
        ]
      : []),
    ...(debugToolsVisible
      ? [
          {
            id: "reset" as const,
            label: "重置测试数据",
            icon: <ResetDataIcon />,
            onSelect: onResetTestData,
            tone: "reset" as const,
            danger: true,
          },
        ]
      : []),
  ] satisfies AvatarMenuItem[];

  const authorNoteSelectionMatches = authorNoteSelection.contextKey === authorNoteContextKey;
  const authorNoteContext = {
    ...baseAuthorNoteContext,
    rareEnabled: authorNoteSelectionMatches && authorNoteSelection.includeRare,
  } satisfies ResultAuthorNoteContext;
  const authorNote = getResultAuthorNote(authorNoteContext, authorNoteSelectionMatches ? authorNoteSelection.noteId : null);
  const authorNoteText = authorNote.text;
  const visibleAuthorNoteText =
    typedAuthorNote.text === authorNoteText ? authorNoteText.slice(0, Math.max(1, typedAuthorNote.length)) : authorNoteText.slice(0, 1);
  const refreshAuthorNote = () => {
    const includeRare = Math.random() < 0.08;
    const nextContext = { ...authorNoteContext, rareEnabled: includeRare };
    const previousNoteId = resultAuthorNoteHistoryByContext.get(authorNoteContextKey) ?? authorNote.id;
    const nextNote = getRandomResultAuthorNote(nextContext, previousNoteId);
    rememberResultAuthorNote(authorNoteContextKey, nextNote.id);
    setAuthorNoteSelection({ contextKey: authorNoteContextKey, includeRare, noteId: nextNote.id });
    setTypedAuthorNote({ length: Math.min(1, nextNote.text.length), text: nextNote.text });
  };

  useEffect(() => {
    rememberResultAuthorNote(authorNoteContextKey, authorNote.id);
  }, [authorNoteContextKey, authorNote.id]);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const reduceMotionTimerId = window.setTimeout(() => {
        setTypedAuthorNote({ length: authorNoteText.length, text: authorNoteText });
      }, 0);
      return () => {
        window.clearTimeout(reduceMotionTimerId);
      };
    }

    if (authorNoteText.length <= 1) return;

    let startTimerId: number | null = null;
    let intervalId: number | null = null;
    let currentLength = 1;
    const typeNextCharacter = () => {
      currentLength = Math.min(currentLength + 1, authorNoteText.length);
      setTypedAuthorNote({ length: currentLength, text: authorNoteText });
      if (currentLength >= authorNoteText.length && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    startTimerId = window.setTimeout(() => {
      typeNextCharacter();
      if (currentLength < authorNoteText.length) {
        intervalId = window.setInterval(typeNextCharacter, AUTHOR_NOTE_TYPE_INTERVAL_MS);
      }
    }, AUTHOR_NOTE_TYPE_START_DELAY_MS);

    return () => {
      if (startTimerId !== null) window.clearTimeout(startTimerId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [authorNoteText]);

  return (
    <section className="result-screen" onPointerDownCapture={closeAvatarMenuFromOutside}>
      <div className={`result-card rank-card ${avatarMenuOpen ? "menu-open" : ""}`}>
        <div className="rank-card-main">
          <div className="rank-title">
            <h1>{rankTitle}</h1>
          </div>
          <div className="rank-avatar-menu-wrap">
            <button
              aria-controls="rank-avatar-menu"
              aria-expanded={avatarMenuOpen}
              aria-haspopup="menu"
              aria-label="打开结果操作气泡"
              className={`rank-avatar-entry ${avatarMenuOpen ? "open" : ""} ${avatarMenuFeedback ? "playing" : ""}`}
              data-transition-avatar-anchor
              type="button"
              onClick={toggleAvatarMenu}
            >
              <PlayerAvatar
                action={avatarEntryAction}
                effect={avatarEntryEffect}
                expression={avatarEntryExpression}
                skin={avatarSkin}
                size={46}
                visualScale={1.02}
              />
            </button>

            {avatarMenuOpen ? (
              <div aria-label="结果操作" className="rank-avatar-menu" id="rank-avatar-menu" role="menu">
                <svg
                  aria-hidden="true"
                  className="rank-avatar-menu-surface"
                  focusable="false"
                  preserveAspectRatio="none"
                  viewBox="0 0 248 122"
                >
                  <path
                    className="rank-avatar-menu-surface-path center"
                    d="M18 13H112L124 2L136 13H230C239.39 13 247 20.61 247 30V104C247 113.39 239.39 121 230 121H18C8.61 121 1 113.39 1 104V30C1 20.61 8.61 13 18 13Z"
                  />
                  <path
                    className="rank-avatar-menu-surface-path edge"
                    d="M18 13H191L203 2L215 13H230C239.39 13 247 20.61 247 30V104C247 113.39 239.39 121 230 121H18C8.61 121 1 113.39 1 104V30C1 20.61 8.61 13 18 13Z"
                  />
              </svg>
              <div className="rank-avatar-bubble">
                  {/* eslint-disable-next-line react-hooks/refs -- Menu callbacks run from click handlers; rendering the memoized list does not read refs. */}
                  {avatarMenuItems.map((item) => (
                    <button
                      aria-label={item.label}
                      className={`rank-avatar-menu-action tone-${item.tone} ${item.danger ? "danger" : ""}`}
                      disabled={avatarMenuFeedback || item.disabled}
                      key={item.id}
                      role="menuitem"
                      type="button"
                      onClick={() => (item.id === "donate" ? item.onSelect() : runAvatarMenuAction(item.onSelect))}
                    >
                      {item.id === "skin" ? <AvatarLabIcon /> : item.icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <button
          className="rank-author-note"
          type="button"
          aria-label="刷新结果提示"
          onClick={refreshAuthorNote}
        >
          {visibleAuthorNoteText}
        </button>
      </div>

      {donatePanelOpen ? (
        <div className="donate-dialog" role="dialog" aria-modal="true" aria-labelledby="donate-dialog-title">
          <div className="donate-card">
            <button className="donate-close" type="button" aria-label="关闭投喂面板" onClick={() => setDonatePanelOpen(false)}>
              ×
            </button>
            <div className="donate-piggy" aria-hidden="true">
              <PlayerAvatar action="celebrate" effect="sparkles" expression="happy" skin="pig" size={62} />
            </div>
            <h2 id="donate-dialog-title">投喂</h2>
            <p className="donate-feed-title">如果你觉得作者做的还不错~</p>
            <div className="donate-feed-options" aria-label="投喂食材选项" role="group">
              {DONATION_FEED_OPTIONS.map((option) => (
                <button
                  aria-pressed={selectedDonationFeed?.id === option.id}
                  className={selectedDonationFeed?.id === option.id ? "selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedDonationFeedId(option.id);
                    setDonateConfirmed(false);
                    setDonateActionReady(false);
                    clearDonateSaveIntentTimer();
                  }}
                >
                  <span>{option.label}</span>
                  <small>{option.note}</small>
                </button>
              ))}
            </div>
            {selectedDonationFeed ? (
              <>
                <div className="donate-qr-grid">
                  {DONATION_PLATFORMS.map((platform) => {
                    const qrImage = selectedDonationFeed.qrImages[platform.id];
                    return (
                      <section className="donate-qr-panel" key={`${selectedDonationFeed.id}-${platform.id}`}>
                        <strong>{platform.label}</strong>
                        <div
                          className="donate-qr-box"
                          onContextMenu={markDonateActionReady}
                          onPointerCancel={clearDonateSaveIntentTimer}
                          onPointerDown={() => {
                            clearDonateSaveIntentTimer();
                            donateSaveIntentTimerRef.current = window.setTimeout(markDonateActionReady, 520);
                          }}
                          onPointerLeave={clearDonateSaveIntentTimer}
                          onPointerUp={clearDonateSaveIntentTimer}
                        >
                          <Image
                            alt={`${platform.label}：${selectedDonationFeed.label}`}
                            className={`donate-qr-image platform-${platform.id}`}
                            height={180}
                            src={qrImage}
                            unoptimized
                            width={180}
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                              event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                            }}
                          />
                          <span className="donate-qr-fallback" hidden>
                            收款码图片加载失败
                          </span>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <p className="donate-save-hint">长按保存图片，打开支付宝/微信扫一扫相册识别</p>
              </>
            ) : null}
            {donateActionReady || donateConfirmed ? (
              <button className="donate-confirm" type="button" onClick={confirmDonate}>
                我已投喂
              </button>
            ) : null}
            {donateConfirmed ? <small className="donate-fed-note">猪猪开心的哼叫~ 投喂皮肤已解锁</small> : null}
          </div>
        </div>
      ) : null}

      {feedbackPanelOpen ? (
        <div className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title">
          <form className="feedback-card" onSubmit={submitFeedback}>
            <button className="feedback-close" type="button" aria-label="关闭反馈面板" onClick={closeFeedbackPanel}>
              ×
            </button>
            <FeedbackIcon />
            <h2 id="feedback-dialog-title">反馈</h2>

            <div className="feedback-rating-row">
              <span>给游戏打个分</span>
              <div className="feedback-rating" aria-label="体验评分">
                {FEEDBACK_RATINGS.map((rating) => (
                  <button
                    aria-pressed={feedbackRating === rating}
                    className={feedbackRating === rating ? "selected" : ""}
                    key={rating}
                    type="button"
                    onClick={() => setFeedbackRating(rating)}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>

            <div className="feedback-type-options" aria-label="反馈类型">
              {FEEDBACK_TYPES.map((item) => (
                <button
                  aria-pressed={feedbackCategory === item.id}
                  className={feedbackCategory === item.id ? "selected" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => setFeedbackCategory(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="feedback-textarea-label" htmlFor="feedback-content">
              <span>文本</span>
              <small>{feedbackContent.length}/{FEEDBACK_CONTENT_MAX_LENGTH}</small>
            </label>
            <textarea
              id="feedback-content"
              maxLength={250}
              placeholder="写下你遇到的问题或想法"
              value={feedbackContent}
              onChange={(event) => {
                setFeedbackContent(event.target.value.slice(0, FEEDBACK_CONTENT_MAX_LENGTH));
                if (feedbackSubmitState !== "submitting") {
                  setFeedbackSubmitState("idle");
                  setFeedbackError("");
                }
              }}
            />

            {feedbackSubmitState === "sent" ? <p className="feedback-status success">已收到！谢谢你玩我的游戏~</p> : null}
            {feedbackSubmitState === "failed" && feedbackError ? <p className="feedback-status error">{feedbackError}</p> : null}

            <div className="feedback-actions">
              <button type="button" onClick={closeFeedbackPanel}>
                取消
              </button>
              <button disabled={feedbackSubmitState === "submitting" || feedbackContent.trim().length === 0} type="submit">
                {feedbackSubmitState === "submitting" ? "发送中" : "发送"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="radar-card-shell">
        <RadarChart axis={result.axis} />
      </div>

      <div className={`score-grid ${advancedUnlockPulseId > 0 ? "advanced-unlock-pulse" : ""}`}>
        {rows.map((row) => {
          const advancedLevel = getAdvancedDimensionLevel(advancedProgress, row.roundId);
          const ScoreEntryTag = advancedUnlocked ? "button" : "div";

          return (
            <ScoreEntryTag
              aria-label={advancedUnlocked ? `进入${row.label}进阶挑战，当前进阶${advancedLevel}` : undefined}
              className={`score-item score-item-button ${advancedUnlocked ? "with-advanced" : ""}`}
              key={row.roundId}
              onClick={advancedUnlocked ? () => onOpenAdvancedChallenge(row.roundId) : undefined}
              type={advancedUnlocked ? "button" : undefined}
            >
              <div className="score-copy">
                <span>{row.label}</span>
                <strong>{row.score}</strong>
                <small>{row.detail}</small>
              </div>

              {advancedUnlocked ? (
                <span className={`advanced-entry-indicator ${getAdvancedLevelTone(advancedLevel)}`} aria-hidden="true">
                  {advancedLevel}
                </span>
              ) : null}
            </ScoreEntryTag>
          );
        })}

        <button
          aria-label={advancedUnlocked ? `进入运气抽取，当前运气${advancedProgress.luckStars}星` : undefined}
          className={`score-item score-item-button luck-score-item ${advancedUnlocked ? "with-advanced" : "locked"}`}
          disabled={!advancedUnlocked}
          type="button"
          onClick={advancedUnlocked ? onOpenLuckDraw : undefined}
        >
          <div className="score-copy luck-copy">
            <span>运气</span>
            <strong>{advancedProgress.luckBestScore}</strong>
            <small aria-label="幸运币状态">{luckStatus}</small>
          </div>

          {advancedUnlocked ? (
            <span className={`advanced-entry-indicator luck-entry-button ${getLuckLevelTone(advancedProgress.luckStars)}`} aria-hidden="true">
              {advancedProgress.luckStars}
            </span>
          ) : null}
        </button>
      </div>
    </section>
  );
}
