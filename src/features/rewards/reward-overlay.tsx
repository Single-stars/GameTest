"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { PlayerAvatar, PLAYER_AVATAR_SKIN_LABELS, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import type { RoundId } from "@/lib/scoring";

const REWARD_CARD_FLIP_MS = 920;
const SKIN_REWARD_REVEAL_COMPLETE_MS = 1900;
const RANK_REWARD_REVEAL_COMPLETE_MS = 1260;
const SKIN_CELEBRATE_MS = 860;

export type RewardOverlayItem =
  | {
      id: string;
      kind: "skin";
      skin: PlayerAvatarSkin;
    }
  | {
      id: string;
      kind: "rank";
      before: string;
      after: string;
    }
  | {
      id: string;
      kind: "endless";
      roundId: RoundId;
      roundTitle: string;
    };

function RewardSkinCard({
  item,
  onClick,
  revealSettled,
  skinCelebrating,
}: {
  item: Extract<RewardOverlayItem, { kind: "skin" }>;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  revealSettled: boolean;
  skinCelebrating: boolean;
}) {
  const skinLabel = PLAYER_AVATAR_SKIN_LABELS[item.skin];

  return (
    <button
      className={`reward-overlay-card reward-skin-card ${revealSettled ? "is-settled" : ""}`}
      type="button"
      aria-label={`已解锁皮肤：${skinLabel}，点击去切换`}
      onClick={onClick}
    >
      <span className="reward-overlay-eyebrow">已解锁皮肤</span>
      <span className="reward-skin-avatar-frame" aria-hidden="true">
        <PlayerAvatar
          action={skinCelebrating ? "celebrate" : "idle"}
          effect={skinCelebrating ? "sparkles" : "none"}
          expression="neutral"
          skin={item.skin}
          size={160}
        />
      </span>
      <span className="reward-skin-copy">
        <strong>{skinLabel}</strong>
        <small>点击卡片去切换</small>
      </span>
    </button>
  );
}

function RewardRankCard({
  item,
  revealSettled,
}: {
  item: Extract<RewardOverlayItem, { kind: "rank" }>;
  revealSettled: boolean;
}) {
  return (
    <div className={`reward-overlay-card reward-rank-card ${revealSettled ? "is-settled" : ""}`} role="dialog" aria-modal="true" aria-label="段位变化">
      <span className="reward-rank-eyebrow">段位提升！</span>
      <div className="reward-rank-switch" aria-live="polite">
        <strong className="reward-rank-value reward-rank-old">{item.before}</strong>
        <strong className="reward-rank-value reward-rank-new">{item.after}</strong>
      </div>
    </div>
  );
}

function RewardEndlessCard({
  item,
  onStartEndlessChallenge,
  revealSettled,
}: {
  item: Extract<RewardOverlayItem, { kind: "endless" }>;
  onStartEndlessChallenge: (roundId: RoundId) => void;
  revealSettled: boolean;
}) {
  const handleStartEndlessChallenge = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onStartEndlessChallenge(item.roundId);
  };

  return (
    <div className={`reward-overlay-card reward-rank-card reward-endless-card ${revealSettled ? "is-settled" : ""}`} role="dialog" aria-modal="true" aria-label={`已解锁${item.roundTitle}·无尽模式`}>
      <span className="reward-rank-eyebrow reward-endless-eyebrow reward-endless-unlock-label">已解锁</span>
      <div className="reward-rank-switch reward-endless-switch" aria-live="polite">
        <strong className="reward-rank-value reward-rank-old" aria-hidden="true">已解锁</strong>
        <strong className="reward-rank-value reward-rank-new">{item.roundTitle}·无尽模式</strong>
      </div>
      <span className="reward-endless-subtitle">可以进入无尽挑战</span>
      <button className="reward-endless-action" type="button" onClick={handleStartEndlessChallenge}>
        前往挑战
      </button>
    </div>
  );
}

function RewardOverlayContent({
  item,
  onDismiss,
  onOpenAvatarLabSkin,
  onStartEndlessChallenge,
}: {
  item: RewardOverlayItem;
  onDismiss: () => void;
  onOpenAvatarLabSkin: (skin: PlayerAvatarSkin) => void;
  onStartEndlessChallenge: (roundId: RoundId) => void;
}) {
  const [activeItemId, setActiveItemId] = useState(item.id);
  const [revealSettled, setRevealSettled] = useState(false);
  const [skinCelebrating, setSkinCelebrating] = useState(false);
  const itemRevealSettled = activeItemId === item.id ? revealSettled : false;
  const itemSkinCelebrating = activeItemId === item.id ? skinCelebrating : false;

  useEffect(() => {
    const revealMs = (item.kind === "rank" || item.kind === "endless") ? RANK_REWARD_REVEAL_COMPLETE_MS : SKIN_REWARD_REVEAL_COMPLETE_MS;
    const revealTimer = window.setTimeout(() => {
      setActiveItemId(item.id);
      setRevealSettled(true);
      setSkinCelebrating(false);
    }, revealMs);
    const celebrateTimer =
      item.kind === "skin"
        ? window.setTimeout(() => {
            setActiveItemId(item.id);
            setSkinCelebrating(true);
          }, REWARD_CARD_FLIP_MS)
        : null;
    const settleTimer =
      item.kind === "skin"
        ? window.setTimeout(() => {
            setActiveItemId(item.id);
            setSkinCelebrating(false);
          }, REWARD_CARD_FLIP_MS + SKIN_CELEBRATE_MS)
        : null;

    return () => {
      window.clearTimeout(revealTimer);
      if (celebrateTimer !== null) window.clearTimeout(celebrateTimer);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [item.id, item.kind]);

  const finishReveal = () => {
    if (itemRevealSettled) return false;
    setActiveItemId(item.id);
    setRevealSettled(true);
    setSkinCelebrating(false);
    return true;
  };

  const handleOverlayClick = () => {
    if (finishReveal()) return;
    onDismiss();
  };

  const handleSkinCardClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (finishReveal()) return;
    if (item.kind !== "skin") return;
    onDismiss();
    onOpenAvatarLabSkin(item.skin);
  };

  return (
    <div className="reward-overlay" role="presentation" onClick={handleOverlayClick}>
      {item.kind === "skin" ? (
        <RewardSkinCard key={item.id} item={item} onClick={handleSkinCardClick} revealSettled={itemRevealSettled} skinCelebrating={itemSkinCelebrating} />
      ) : item.kind === "rank" ? (
        <RewardRankCard key={item.id} item={item} revealSettled={itemRevealSettled} />
      ) : (
        <RewardEndlessCard key={item.id} item={item} onStartEndlessChallenge={onStartEndlessChallenge} revealSettled={itemRevealSettled} />
      )}
    </div>
  );
}

export function RewardOverlay({
  item,
  onDismiss,
  onOpenAvatarLabSkin,
  onStartEndlessChallenge,
}: {
  item: RewardOverlayItem | null;
  onDismiss: () => void;
  onOpenAvatarLabSkin: (skin: PlayerAvatarSkin) => void;
  onStartEndlessChallenge: (roundId: RoundId) => void;
}) {
  if (!item) return null;

  return <RewardOverlayContent item={item} onDismiss={onDismiss} onOpenAvatarLabSkin={onOpenAvatarLabSkin} onStartEndlessChallenge={onStartEndlessChallenge} />;
}
