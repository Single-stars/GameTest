"use client";

export function MultiplayerEntry({
  onCreate,
  disabled,
}: {
  onCreate: () => void;
  onOpenJoin: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="multiplayer-entry-card">
      <h2>创建房间</h2>
      <p>发起房间后，把房间链接或房间码发给好友。</p>
      <button type="button" disabled={disabled} onClick={onCreate}>
        创建联机房间
      </button>
    </div>
  );
}
