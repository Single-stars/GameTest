"use client";

import { useState } from "react";

export function JoinRoom({
  defaultHostId = "",
  onJoin,
  disabled,
}: {
  defaultHostId?: string;
  onJoin: (hostId: string) => void;
  disabled?: boolean;
}) {
  const [hostId, setHostId] = useState(defaultHostId);

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
        value={hostId}
        disabled={disabled}
        onChange={(event) => setHostId(event.currentTarget.value)}
        placeholder="输入房主ID"
        style={{ width: "100%", marginTop: 8, padding: "8px" }}
      />
      <button
        type="button"
        disabled={disabled || hostId.trim().length === 0}
        style={{ marginTop: 8 }}
        onClick={() => onJoin(hostId.trim())}
      >
        加入
      </button>
    </div>
  );
}
