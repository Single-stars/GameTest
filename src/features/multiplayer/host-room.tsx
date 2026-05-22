"use client";

export function HostRoom({
  roomLink,
  onCopy,
  copyStatus = "idle",
}: {
  roomLink: string;
  onCopy: () => void;
  copyStatus?: "idle" | "copied" | "manual";
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
      <p style={{ margin: 0, fontWeight: 600 }}>房间链接</p>
      <input
        aria-label="房间链接"
        readOnly
        value={roomLink}
        onFocus={(event) => event.currentTarget.select()}
        style={{
          boxSizing: "border-box",
          width: "100%",
          margin: "8px 0",
          padding: "8px",
          border: "1px solid #d6d6d6",
          borderRadius: 8,
          fontSize: 13,
        }}
      />
      <button type="button" onClick={onCopy}>
        {copyStatus === "copied" ? "已复制" : "复制链接"}
      </button>
      {copyStatus === "manual" ? (
        <p style={{ margin: "8px 0 0", color: "#a15c00", fontSize: 13 }}>
          当前浏览器禁止自动复制，请手动选中链接复制。
        </p>
      ) : null}
    </div>
  );
}
