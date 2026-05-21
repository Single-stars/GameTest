"use client";

import { PlayerAvatar, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import type { GameResult, PlayerInfo, SelfGameState } from "@/lib/multiplayer/types";

function resolveSkinId(player: PlayerInfo | null): PlayerAvatarSkin {
  const fallback: PlayerAvatarSkin = "cyan";
  if (!player) return fallback;
  const validSkins: PlayerAvatarSkin[] = [
    "cyan",
    "mint",
    "amber",
    "rose",
    "slate",
    "basketball",
    "pig",
  ];
  return validSkins.includes(player.skinId as PlayerAvatarSkin)
    ? (player.skinId as PlayerAvatarSkin)
    : fallback;
}

function formatState(state: SelfGameState | null) {
  if (!state) return "未开始";
  const score = state.score ?? 0;
  return `进度 ${Math.round(state.progress * 100)}% / 分数 ${Math.round(score)}`;
}

function formatResult(result: GameResult | null) {
  if (!result) return "未结算";
  const passText = result.passed ? "通关" : "失败";
  const timeText = result.timeMs ? ` / ${result.timeMs}ms` : "";
  return `${passText} / ${Math.round(result.score)}分${timeText}`;
}

export function PlayerCard({
  title,
  player,
  ready,
  state,
  result,
}: {
  title: string;
  player: PlayerInfo | null;
  ready: boolean;
  state: SelfGameState | null;
  result: GameResult | null;
}) {
  return (
    <div
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        minWidth: 180,
      }}
    >
      <p style={{ margin: 0, color: "#666", fontSize: 13 }}>{title}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <PlayerAvatar skin={resolveSkinId(player)} size={44} action="idle" expression="neutral" />
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{player?.name ?? "等待中"}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: ready ? "#087443" : "#934f00" }}>
            {ready ? "已准备" : "未准备"}
          </p>
        </div>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12 }}>{formatState(state)}</p>
      <p style={{ margin: "6px 0 0", fontSize: 12 }}>{formatResult(result)}</p>
    </div>
  );
}
