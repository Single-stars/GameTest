"use client";

import type { MultiplayerStatus } from "@/lib/multiplayer/types";

function statusLabel(status: MultiplayerStatus) {
  switch (status) {
    case "idle":
      return "未开始";
    case "creating":
      return "正在创建房间";
    case "waiting":
      return "等待好友加入";
    case "joining":
      return "正在加入房间";
    case "connected":
      return "已连接";
    case "countdown":
      return "倒计时中";
    case "playing":
      return "游戏中";
    case "finished":
      return "已结束";
    case "failed":
      return "连接失败";
    case "disconnected":
      return "已断开";
    default:
      return "未知状态";
  }
}

export function ConnectionStatus({
  status,
  errorMessage,
  opponentJoining = false,
}: {
  status: MultiplayerStatus;
  errorMessage: string | null;
  opponentJoining?: boolean;
}) {
  const label = opponentJoining && (status === "waiting" || status === "connected") ? "好友加入中" : statusLabel(status);
  return (
    <div
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 10,
        padding: "10px 12px",
        background: "#fafafa",
      }}
    >
      <strong>联机状态：</strong>
      <span>{label}</span>
      {errorMessage ? (
        <p style={{ margin: "8px 0 0", color: "#b42318" }}>{errorMessage}</p>
      ) : null}
    </div>
  );
}
