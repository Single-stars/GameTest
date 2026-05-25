"use client";

export function HostRoom({
  roomCode,
  roomCodeCopyStatus = "idle",
  roomLink,
  onCopy,
  onCopyRoomCode,
  copyStatus = "idle",
}: {
  roomCode: string;
  roomCodeCopyStatus?: "idle" | "copied" | "manual" | "expired";
  roomLink: string;
  onCopy: () => void;
  onCopyRoomCode: () => void;
  copyStatus?: "idle" | "copied" | "manual" | "expired";
}) {
  return (
    <div
      style={{
        border: "1px solid #d6d6d6",
        borderRadius: 10,
        padding: "12px",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto minmax(7ch, 1fr) auto auto",
          gap: 8,
          alignItems: "center",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800 }}>房间码</span>
        <output
          aria-label="房间码"
          style={{
            minWidth: 0,
            border: "1px solid #d6d6d6",
            borderRadius: 8,
            padding: "7px 8px",
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: "0.08em",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {roomCode}
        </output>
        <button type="button" onClick={onCopyRoomCode} style={{ whiteSpace: "nowrap" }}>
          {roomCodeCopyStatus === "copied" ? "已复制" : "复制码"}
        </button>
        <button type="button" onClick={onCopy} style={{ whiteSpace: "nowrap" }} aria-label={`复制邀请链接 ${roomLink}`}>
          {copyStatus === "copied" ? "已复制" : "复制链接"}
        </button>
      </div>
      {copyStatus === "manual" ? (
        <p style={{ margin: "8px 0 0", color: "#a15c00", fontSize: 13 }}>
          当前浏览器禁止自动复制，请手动选中链接复制。
        </p>
      ) : null}
      {roomCodeCopyStatus === "manual" ? (
        <p style={{ margin: "8px 0 0", color: "#a15c00", fontSize: 13 }}>
          当前浏览器禁止自动复制，请手动复制房间码 {roomCode}。
        </p>
      ) : null}
      {copyStatus === "expired" || roomCodeCopyStatus === "expired" ? (
        <p style={{ margin: "8px 0 0", color: "#a15c00", fontSize: 13 }}>
          房间已失效，已刷新房间码和邀请链接。
        </p>
      ) : null}
    </div>
  );
}
