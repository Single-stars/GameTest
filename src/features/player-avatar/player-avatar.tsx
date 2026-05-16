import type { CSSProperties, Ref } from "react";

import styles from "./player-avatar.module.css";

export type PlayerAvatarState =
  | "idle"
  | "move"
  | "charge"
  | "jump"
  | "fall"
  | "land"
  | "hit"
  | "success"
  | "fail"
  | "win"
  | "sleep"
  | "thinking"
  | "warning"
  | "shield"
  | "boost";

export type PlayerAvatarMood =
  | "normal"
  | "happy"
  | "focused"
  | "nervous"
  | "scared"
  | "angry"
  | "sleepy";

export type PlayerAvatarGravity = "normal" | "light" | "heavy";
export type PlayerAvatarSize = "sm" | "md" | "lg" | number;
export type PlayerAvatarDirection = "left" | "right" | "none";
export type PlayerAvatarSkin = "cyan" | "mint" | "amber" | "rose" | "slate";

export type PlayerAvatarProps = {
  state: PlayerAvatarState | PlayerAvatarState[];
  mood?: PlayerAvatarMood;
  gravity?: PlayerAvatarGravity;
  skin?: PlayerAvatarSkin;
  size?: PlayerAvatarSize;
  direction?: PlayerAvatarDirection;
  rotationTurns?: number;
  rotationDeg?: number;
  charge?: number;
  rootRef?: Ref<HTMLSpanElement>;
  visualScale?: number;
  active?: boolean;
  className?: string;
};

const PLAYER_AVATAR_STATE_PRIORITY: PlayerAvatarState[] = [
  "fail",
  "hit",
  "win",
  "success",
  "warning",
  "shield",
  "boost",
  "charge",
  "jump",
  "fall",
  "land",
  "move",
  "thinking",
  "sleep",
  "idle",
];

function clampAvatarUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampAvatarScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.75, Math.min(1.6, value));
}

function resolvePlayerAvatarState(state: PlayerAvatarState | PlayerAvatarState[], active = true): PlayerAvatarState {
  if (!active) return "idle";
  const states = Array.isArray(state) ? state : [state];
  return PLAYER_AVATAR_STATE_PRIORITY.find((candidate) => states.includes(candidate)) ?? "idle";
}

function resolveSizeClass(size: PlayerAvatarSize) {
  if (typeof size === "number") return "";
  return styles[size];
}

function toFixedVar(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function PlayerAvatar({
  active = true,
  charge = 0,
  className = "",
  direction = "none",
  gravity = "normal",
  mood = "normal",
  rotationDeg,
  rotationTurns = 0,
  rootRef,
  size = "md",
  skin = "cyan",
  state,
  visualScale = 1,
}: PlayerAvatarProps) {
  const resolvedState = resolvePlayerAvatarState(state, active);
  const normalizedCharge = clampAvatarUnit(charge);
  const normalizedVisualScale = clampAvatarScale(visualScale);
  const rotation = rotationDeg ?? rotationTurns * 90;
  const customSize = typeof size === "number" ? `${size}px` : undefined;
  const rootClassName = [styles.root, resolveSizeClass(size), className].filter(Boolean).join(" ");
  const style = {
    "--player-avatar-charge": toFixedVar(normalizedCharge),
    "--player-avatar-charge-offset": `${toFixedVar(normalizedCharge * 4)}px`,
    "--player-avatar-charge-scale-x": toFixedVar(1 + normalizedCharge * 0.18),
    "--player-avatar-charge-scale-y": toFixedVar(1 - normalizedCharge * 0.24),
    "--player-avatar-rotation": `${rotation}deg`,
    "--player-avatar-size": customSize,
    "--player-avatar-visual-scale": toFixedVar(normalizedVisualScale),
  } as CSSProperties & Record<string, string | undefined>;

  return (
    <span
      aria-hidden="true"
      className={rootClassName}
      data-active={active ? "true" : "false"}
      data-direction={direction}
      data-gravity={gravity}
      data-mood={mood}
      data-skin={skin}
      data-state={resolvedState}
      ref={rootRef}
      style={style}
    >
      <span className={styles.visual}>
        <span className={styles.shadow} />
        <span className={styles.speedLines} />
        <span className={styles.sparkles} />
        <span className={styles.warningMark}>!</span>
        <span className={styles.shield} />
        <span className={styles.motion}>
          <span className={styles.rotator}>
            <span className={styles.body}>
              <span className={`${styles.eye} ${styles.leftEye}`} />
              <span className={`${styles.eye} ${styles.rightEye}`} />
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
