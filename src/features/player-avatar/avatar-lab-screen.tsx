"use client";

import { useMemo, useState } from "react";

import {
  PLAYER_AVATAR_ACTIONS,
  PLAYER_AVATAR_EXPRESSIONS,
  PlayerAvatar,
  type PlayerAvatarAction,
  type PlayerAvatarEffect,
  type PlayerAvatarExpression,
} from "@/features/player-avatar/player-avatar";
import {
  PLAYER_AVATAR_SKIN_LABELS,
  PLAYER_AVATAR_SKINS,
  type PlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar-skin";

type AvatarScene = {
  id: string;
  label: string;
  action: PlayerAvatarAction;
  expression: PlayerAvatarExpression;
  effect: PlayerAvatarEffect;
};

const AVATAR_LAB_SCENES = [
  { id: "idle", label: "待机", action: "idle", expression: "neutral", effect: "none" },
  { id: "move", label: "移动", action: "move", expression: "neutral", effect: "none" },
  { id: "charge", label: "蓄力", action: "charge", expression: "neutral", effect: "none" },
  { id: "land", label: "落地", action: "land", expression: "happy", effect: "none" },
  { id: "hit", label: "受击", action: "hit", expression: "hurt", effect: "none" },
  { id: "celebrate", label: "胜利", action: "celebrate", expression: "happy", effect: "sparkles" },
  { id: "sleep", label: "睡眠", action: "sleep", expression: "sleepy", effect: "none" },
  { id: "wonder", label: "疑问", action: "wonder", expression: "neutral", effect: "question" },
  { id: "shield", label: "护盾", action: "idle", expression: "neutral", effect: "shield" },
] as const satisfies readonly AvatarScene[];

const ACTION_LABELS: Record<PlayerAvatarAction, string> = {
  celebrate: "胜利",
  charge: "蓄力",
  hit: "受击",
  idle: "待机",
  land: "落地",
  move: "移动",
  sleep: "睡眠",
  wonder: "疑问",
};

const EXPRESSION_LABELS: Record<PlayerAvatarExpression, string> = {
  happy: "开心",
  hurt: "受伤",
  neutral: "普通",
  scared: "惊吓",
  sleepy: "困倦",
};

export function AvatarLabScreen({
  onBack,
  onSelectSkin,
  selectedSkin,
}: {
  onBack: () => void;
  onSelectSkin: (skin: PlayerAvatarSkin) => void;
  selectedSkin: PlayerAvatarSkin;
}) {
  const [activeAction, setActiveAction] = useState<PlayerAvatarAction>("idle");
  const [activeExpression, setActiveExpression] = useState<PlayerAvatarExpression>("neutral");
  const [activeEffect, setActiveEffect] = useState<PlayerAvatarEffect>("none");
  const [previewKey, setPreviewKey] = useState(0);

  const activeScene = useMemo(
    () =>
      AVATAR_LAB_SCENES.find(
        (scene) => scene.action === activeAction && scene.expression === activeExpression && scene.effect === activeEffect,
      ),
    [activeAction, activeEffect, activeExpression],
  );

  const playScene = (scene: AvatarScene) => {
    setActiveAction(scene.action);
    setActiveExpression(scene.expression);
    setActiveEffect(scene.effect);
    setPreviewKey((current) => current + 1);
  };

  return (
    <section className="avatar-lab-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>小方块</span>
      </header>

      <div className="avatar-lab-stage">
        <div className="avatar-lab-preview" key={previewKey}>
          <PlayerAvatar
            action={activeAction}
            effect={activeEffect}
            expression={activeExpression}
            direction={activeAction === "move" ? "right" : "none"}
            skin={selectedSkin}
            size={132}
            charge={activeAction === "charge" ? 0.76 : 0}
          />
        </div>
        <p>{activeScene ? activeScene.label : `${ACTION_LABELS[activeAction]} · ${EXPRESSION_LABELS[activeExpression]}`}</p>
      </div>

      <div className="avatar-lab-controls">
        <section className="avatar-lab-section">
          <h2>皮肤</h2>
          <div className="avatar-lab-skin-grid">
            {PLAYER_AVATAR_SKINS.map((skin) => (
              <button
                aria-pressed={selectedSkin === skin}
                className={`avatar-lab-skin ${selectedSkin === skin ? "selected" : ""}`}
                key={skin}
                onPointerDown={() => onSelectSkin(skin)}
                type="button"
              >
                <PlayerAvatar action="idle" expression="neutral" skin={skin} size={38} />
                <span>{PLAYER_AVATAR_SKIN_LABELS[skin]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="avatar-lab-section">
          <h2>场景</h2>
          <div className="avatar-lab-button-grid">
            {AVATAR_LAB_SCENES.map((scene) => (
              <button
                className={activeScene?.id === scene.id ? "selected" : ""}
                key={scene.id}
                onPointerDown={() => playScene(scene)}
                type="button"
              >
                {scene.label}
              </button>
            ))}
          </div>
        </section>

        <section className="avatar-lab-section">
          <h2>动作</h2>
          <div className="avatar-lab-button-grid">
            {PLAYER_AVATAR_ACTIONS.map((action) => (
              <button
                className={activeAction === action ? "selected" : ""}
                key={action}
                onPointerDown={() => {
                  setActiveAction(action);
                  setPreviewKey((current) => current + 1);
                }}
                type="button"
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </section>

        <section className="avatar-lab-section">
          <h2>眼神</h2>
          <div className="avatar-lab-button-grid">
            {PLAYER_AVATAR_EXPRESSIONS.map((expression) => (
              <button
                className={activeExpression === expression ? "selected" : ""}
                key={expression}
                onPointerDown={() => setActiveExpression(expression)}
                type="button"
              >
                {EXPRESSION_LABELS[expression]}
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
