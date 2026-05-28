"use client";

import type { AdvancedProgress } from "@/lib/advanced-progress";
import { LockIcon } from "@/features/results/result-icons";
import { PlayerAvatar } from "@/features/player-avatar/player-avatar";
import {
  PLAYER_AVATAR_SKIN_DESCRIPTIONS,
  PLAYER_AVATAR_SKIN_LABELS,
  getPlayerAvatarSkinDisplayItems,
  type PlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar-skin";

export function AvatarLabScreen({
  advancedProgress,
  onBack,
  onSelectSkin,
  selectedSkin,
}: {
  advancedProgress: AdvancedProgress;
  onBack: () => void;
  onSelectSkin: (skin: PlayerAvatarSkin) => void;
  selectedSkin: PlayerAvatarSkin;
}) {
  const skinItems = getPlayerAvatarSkinDisplayItems(advancedProgress);

  return (
    <section className="avatar-lab-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>小方块皮肤</span>
      </header>

      <div className="avatar-lab-stage">
        <div className="avatar-lab-preview">
          <PlayerAvatar action="idle" effect="none" expression="neutral" skin={selectedSkin} size={132} />
        </div>
        <p>{PLAYER_AVATAR_SKIN_LABELS[selectedSkin]}</p>
      </div>

      <div className="avatar-lab-controls">
        <section className="avatar-lab-section">
          <h2>皮肤</h2>
          <div className="avatar-lab-skin-list">
            {skinItems.map(({ skin, unlock }) => {
              return (
                <button
                  aria-pressed={selectedSkin === skin}
                  className={`avatar-lab-skin-row ${selectedSkin === skin ? "selected" : ""} ${unlock.unlocked ? "unlocked" : "locked"}`}
                  disabled={!unlock.unlocked}
                  key={skin}
                  onClick={() => {
                    if (unlock.unlocked) onSelectSkin(skin);
                  }}
                  type="button"
                >
                  <PlayerAvatar action="idle" expression="neutral" skin={skin} size={44} />
                  <span className="avatar-lab-skin-copy">
                    <strong>{PLAYER_AVATAR_SKIN_LABELS[skin]}</strong>
                    <small>{PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin]}</small>
                    <em>{unlock.label}</em>
                  </span>
                  {!unlock.unlocked ? (
                    <span className="avatar-lab-lock" aria-hidden="true">
                      <LockIcon />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
