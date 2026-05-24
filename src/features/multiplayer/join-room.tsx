"use client";

import { useState } from "react";

export function JoinRoom({
  defaultRoomCode = "",
  onJoin,
  disabled,
}: {
  defaultRoomCode?: string;
  onJoin: (roomCode: string) => void;
  disabled?: boolean;
}) {
  const [roomCode, setRoomCode] = useState(defaultRoomCode);

  return (
    <div className="multiplayer-entry-card">
      <h2>加入房间</h2>
      <p>输入好友发来的房间码进入同一局。</p>
      <input
        value={roomCode}
        disabled={disabled}
        onChange={(event) => setRoomCode(event.currentTarget.value)}
        placeholder="输入房间码"
      />
      <button
        type="button"
        disabled={disabled || roomCode.trim().length === 0}
        onClick={() => onJoin(roomCode.trim())}
      >
        加入房间
      </button>
    </div>
  );
}
