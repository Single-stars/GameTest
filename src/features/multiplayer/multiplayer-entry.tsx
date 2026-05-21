"use client";

export function MultiplayerEntry({
  onCreate,
  onOpenJoin,
  disabled,
}: {
  onCreate: () => void;
  onOpenJoin: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>联机挑战</h2>
      <p style={{ margin: "8px 0 14px", color: "#666" }}>
        1v1 P2P 实验模式（一路向上进阶7实验关）
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" disabled={disabled} onClick={onCreate}>
          创建联机房间
        </button>
        <button type="button" disabled={disabled} onClick={onOpenJoin}>
          通过房主ID加入
        </button>
      </div>
    </div>
  );
}
