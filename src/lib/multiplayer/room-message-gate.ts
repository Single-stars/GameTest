import type { MultiplayerSnapshot } from "./types.ts";

type PeerRoomMessageGateSnapshot = Pick<MultiplayerSnapshot, "connectionState" | "opponentPlayer" | "status">;

export function canSendPeerRoomMessageSnapshot(
  snapshot: PeerRoomMessageGateSnapshot,
  transportConnected: boolean,
) {
  return (
    snapshot.connectionState === "connected" &&
    snapshot.status === "connected" &&
    Boolean(snapshot.opponentPlayer) &&
    transportConnected
  );
}
