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
    <div
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 10,
        padding: "12px",
        background: "#fff",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>加入房间</p>
      <input
        value={roomCode}
        disabled={disabled}
        onChange={(event) => setRoomCode(event.currentTarget.value)}
        placeholder="输入房间码"
        style={{ width: "100%", marginTop: 8, padding: "8px" }}
      />
      <button
        type="button"
        disabled={disabled || roomCode.trim().length === 0}
        style={{ marginTop: 8 }}
        onClick={() => onJoin(roomCode.trim())}
      >
        加入
      </button>
    </div>
  );
}
