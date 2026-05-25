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
    <div className="multiplayer-share-card">
      {(copyStatus === "expired" || roomCodeCopyStatus === "expired") ? (
        <p className="multiplayer-share-alert">房间已失效，已刷新房间码和邀请链接。</p>
      ) : null}
      <div className="multiplayer-share-grid">
        <div className="multiplayer-share-item">
          <span>房间码</span>
          <output className="multiplayer-share-value code" aria-label="房间码">
            {roomCode}
          </output>
          <button type="button" onClick={onCopyRoomCode}>
            {roomCodeCopyStatus === "copied" ? "已复制" : "复制码"}
          </button>
        </div>
        <div className="multiplayer-share-item">
          <span>邀请链接</span>
          <output className="multiplayer-share-value link" aria-label="邀请链接">
            {roomLink}
          </output>
          <button type="button" onClick={onCopy} aria-label={`复制邀请链接 ${roomLink}`}>
            {copyStatus === "copied" ? "已复制" : "复制链接"}
          </button>
        </div>
      </div>
      {copyStatus === "manual" ? (
        <p className="multiplayer-share-note">
          当前浏览器禁止自动复制，请手动选中链接复制。
        </p>
      ) : null}
      {roomCodeCopyStatus === "manual" ? (
        <p className="multiplayer-share-note">
          当前浏览器禁止自动复制，请手动复制房间码 {roomCode}。
        </p>
      ) : null}
    </div>
  );
}
